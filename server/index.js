const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "127.0.0.1";
const JWT_SECRET = process.env.JWT_SECRET || "replace-this-development-secret";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data.json");
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "backups");
const SCHEMA_VERSION = 2;
const rateBuckets = new Map();

if (process.env.NODE_ENV === "production" && JWT_SECRET === "replace-this-development-secret") {
  throw new Error("JWT_SECRET must be set in production");
}

function readDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const users = db.users || [];
    const estateOwners = new Set();
    users.forEach(user => { if (user.role === "owner") estateOwners.add(user.estateId); });
    users.forEach(user => { if (!user.role) { user.role = estateOwners.has(user.estateId) ? "viewer" : "owner"; estateOwners.add(user.estateId); } });
    return {...db, users, schemaVersion:SCHEMA_VERSION, refreshTokens:db.refreshTokens || [], auditLog:db.auditLog || []};
  } catch { return {schemaVersion:SCHEMA_VERSION, users:[], estates:[], reminders:[], refreshTokens:[], auditLog:[]}; }
}
function backupDb() {
  if (!fs.existsSync(DATA_FILE)) return;
  fs.mkdirSync(BACKUP_DIR, {recursive:true});
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  fs.copyFileSync(DATA_FILE, path.join(BACKUP_DIR, `data-${stamp}.json`));
  const files = fs.readdirSync(BACKUP_DIR).sort();
  files.slice(0, Math.max(0, files.length - 14)).forEach(file => fs.rmSync(path.join(BACKUP_DIR, file)));
}
function writeDb(db) {
  fs.mkdirSync(path.dirname(DATA_FILE), {recursive:true});
  backupDb();
  db.schemaVersion = SCHEMA_VERSION;
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, DATA_FILE);
}
function json(res, status, body) {
  res.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Access-Control-Allow-Origin":CORS_ORIGIN, "Access-Control-Allow-Headers":"Content-Type, Authorization", "Access-Control-Allow-Methods":"GET, POST, PUT, OPTIONS"});
  res.end(JSON.stringify(body));
}
function rateLimit(req, res, limit=120, windowMs=60_000) {
  const key = `${req.socket.remoteAddress || "unknown"}:${req.url.startsWith("/api/auth/") ? "auth" : "api"}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key) || {start:now,count:0};
  if (now - bucket.start >= windowMs) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1; rateBuckets.set(key, bucket);
  if (bucket.count > limit) { res.setHeader("Retry-After", Math.ceil((bucket.start + windowMs - now) / 1000)); json(res, 429, {error:"Too many requests"}); return false; }
  return true;
}
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => { raw += chunk; if (raw.length > 5_000_000) reject(new Error("Request too large")); });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}
function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(`${salt}:${key.toString("hex")}`)));
}
async function passwordMatches(password, stored) {
  const [salt, expected] = String(stored).split(":");
  if (!salt || !expected) return false;
  const actual = (await passwordHash(password, salt)).split(":")[1];
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}
function base64(value) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function tokenFor(user) {
  const head = base64({alg:"HS256",typ:"JWT"});
  const payload = base64({sub:user.id, estateId:user.estateId, email:user.email, role:user.role, exp:Date.now() + 15 * 60 * 1000});
  const unsigned = `${head}.${payload}`;
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(unsigned).digest("base64url");
  return `${unsigned}.${sig}`;
}
function userFrom(req, db) {
  const value = req.headers.authorization || "";
  const token = value.startsWith("Bearer ") ? value.slice(7).split(".") : [];
  if (token.length !== 3) return null;
  const unsigned = `${token[0]}.${token[1]}`;
  const expected = crypto.createHmac("sha256", JWT_SECRET).update(unsigned).digest("base64url");
  if (expected !== token[2]) return null;
  try {
    const payload = JSON.parse(Buffer.from(token[1], "base64url").toString("utf8"));
    if (payload.exp < Date.now()) return null;
    return db.users.find(user => user.id === payload.sub && user.estateId === payload.estateId) || null;
  } catch { return null; }
}
function publicUser(user) { return {id:user.id, email:user.email, name:user.name, role:user.role || "viewer", estateId:user.estateId}; }
function emptyData() { return {residents:[], transactions:[], projects:[], contribs:[], reminders:[]}; }
function sessionFor(user, db) {
  const refresh = crypto.randomBytes(48).toString("base64url");
  db.refreshTokens.push({hash:crypto.createHash("sha256").update(refresh).digest("hex"), userId:user.id, expiresAt:Date.now() + 30 * 24 * 60 * 60 * 1000});
  const accessToken = tokenFor(user);
  return {accessToken, refreshToken:refresh, token:accessToken};
}
function audit(db, user, action, details={}) {
  db.auditLog.push({id:crypto.randomUUID(), estateId:user.estateId, userId:user.id, action, details, createdAt:new Date().toISOString()});
}
function can(user, roles) { return roles.includes(user.role || "viewer"); }

async function handle(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (!rateLimit(req, res, req.url.startsWith("/api/auth/") ? 20 : 120)) return;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const db = readDb();
  try {
    if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, {ok:true, service:"lemayian-court-api"});
    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const input = await body(req);
      const email = String(input.email || "").trim().toLowerCase();
      const password = String(input.password || "");
      const name = String(input.name || "Estate Manager").trim();
      if (!email || password.length < 8) return json(res, 400, {error:"Email and a password of at least 8 characters are required"});
      if (db.users.some(user => user.email === email)) return json(res, 409, {error:"An account with that email already exists"});
      const estate = {id:crypto.randomUUID(), name:String(input.estateName || "Lemayian Court").trim()};
      const user = {id:crypto.randomUUID(), email, name, role:"owner", estateId:estate.id, passwordHash:await passwordHash(password)};
      db.estates.push({...estate, data:emptyData()}); db.users.push(user); writeDb(db);
      const session = sessionFor(user, db); audit(db, user, "auth.register"); writeDb(db);
      return json(res, 201, {...session, user:publicUser(user), data:emptyData()});
    }
    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const input = await body(req);
      const user = db.users.find(item => item.email === String(input.email || "").trim().toLowerCase());
      if (!user || !(await passwordMatches(String(input.password || ""), user.passwordHash))) return json(res, 401, {error:"Invalid email or password"});
      const estate = db.estates.find(item => item.id === user.estateId);
      const session = sessionFor(user, db); audit(db, user, "auth.login"); writeDb(db);
      return json(res, 200, {...session, user:publicUser(user), data:estate?.data || emptyData()});
    }
    if (req.method === "POST" && url.pathname === "/api/auth/refresh") {
      const input = await body(req);
      const hash = crypto.createHash("sha256").update(String(input.refreshToken || "")).digest("hex");
      const current = db.refreshTokens.find(item => item.hash === hash && !item.revokedAt && item.expiresAt > Date.now());
      if (!current) return json(res, 401, {error:"Refresh token is invalid or expired"});
      current.revokedAt = new Date().toISOString();
      const user = db.users.find(item => item.id === current.userId);
      if (!user) return json(res, 401, {error:"Account not found"});
      const session = sessionFor(user, db); audit(db, user, "auth.refresh"); writeDb(db);
      return json(res, 200, {...session, user:publicUser(user)});
    }
    const user = userFrom(req, db);
    if (!user) return json(res, 401, {error:"Authentication required"});
    const estate = db.estates.find(item => item.id === user.estateId);
    if (!estate) return json(res, 404, {error:"Estate not found"});
    if (req.method === "GET" && url.pathname === "/api/me") return json(res, 200, {user:publicUser(user), data:estate.data || emptyData()});
    if (req.method === "PUT" && url.pathname === "/api/data") {
      if (!can(user, ["owner", "manager", "accountant"])) return json(res, 403, {error:"Your role cannot edit estate data"});
      const input = await body(req);
      estate.data = {residents:Array.isArray(input.residents)?input.residents:[], transactions:Array.isArray(input.transactions)?input.transactions:[], projects:Array.isArray(input.projects)?input.projects:[], contribs:Array.isArray(input.contribs)?input.contribs:[], reminders:Array.isArray(input.reminders)?input.reminders:[]};
      audit(db, user, "data.replace", {counts:Object.fromEntries(Object.entries(estate.data).map(([key,value]) => [key,value.length]))});
      writeDb(db); return json(res, 200, {data:estate.data});
    }
    if (req.method === "POST" && url.pathname === "/api/reminders") {
      if (!can(user, ["owner", "manager", "accountant"])) return json(res, 403, {error:"Your role cannot create reminders"});
      const input = await body(req);
      const reminder = {id:crypto.randomUUID(), estateId:estate.id, residentId:String(input.residentId || ""), channel:String(input.channel || "log"), message:String(input.message || ""), createdAt:new Date().toISOString(), status:"logged"};
      db.reminders.push(reminder); audit(db, user, "reminder.create", {reminderId:reminder.id}); writeDb(db); return json(res, 201, {reminder});
    }
    if (req.method === "GET" && url.pathname === "/api/audit") {
      if (!can(user, ["owner", "manager"])) return json(res, 403, {error:"Your role cannot view the audit log"});
      return json(res, 200, {auditLog:db.auditLog.filter(item => item.estateId === user.estateId).slice(-200).reverse()});
    }
    if (req.method === "GET" && url.pathname === "/api/members") {
      if (!can(user, ["owner", "manager"])) return json(res, 403, {error:"Your role cannot view members"});
      return json(res, 200, {members:db.users.filter(item => item.estateId === user.estateId).map(publicUser)});
    }
    if (req.method === "POST" && url.pathname === "/api/members") {
      if (!can(user, ["owner"])) return json(res, 403, {error:"Only an estate owner can invite members"});
      const input = await body(req);
      const email = String(input.email || "").trim().toLowerCase();
      const role = ["manager", "accountant", "viewer"].includes(input.role) ? input.role : "viewer";
      if (!email || String(input.password || "").length < 8) return json(res, 400, {error:"Member email and an 8-character password are required"});
      if (db.users.some(item => item.email === email)) return json(res, 409, {error:"An account with that email already exists"});
      const member = {id:crypto.randomUUID(), email, name:String(input.name || email).trim(), role, estateId:user.estateId, passwordHash:await passwordHash(String(input.password))};
      db.users.push(member); audit(db, user, "member.create", {memberId:member.id, role}); writeDb(db);
      return json(res, 201, {member:publicUser(member)});
    }
    return json(res, 404, {error:"Route not found"});
  } catch (error) {
    return json(res, error.message === "Invalid JSON" ? 400 : 500, {error:error.message || "Server error"});
  }
}

http.createServer(handle).listen(PORT, HOST, () => console.log(`Lemayian Court API listening on http://${HOST}:${PORT}`));
