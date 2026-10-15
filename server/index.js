const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {isDeepStrictEqual} = require("node:util");

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
    const user = db.users.find(user => user.id === payload.sub && user.estateId === payload.estateId);
    if (!user || user.active === false) return null;
    return user;
  } catch { return null; }
}
function publicUser(user) {
  return {id:user.id, email:user.email, name:user.name, role:user.role || "viewer", estateId:user.estateId,
    active:user.active !== false, createdAt:user.createdAt || null,
    ...(user.role === "resident" ? {residentId:user.residentId} : {})};
}
function emptyData() { return {residents:[], transactions:[], projects:[], contribs:[], reminders:[], provider:null, providerPayments:[], providerInvoices:[]}; }
function dataForUser(user, data) {
  if (user.role !== "resident") return {...emptyData(),...data};
  const resident = (data.residents || []).find(item => item.id === user.residentId);
  if (!resident) return null;
  return {
    residents:[resident],
    transactions:(data.transactions || []).filter(item => item.residentId === resident.id),
    projects:[],
    contribs:(data.contribs || []).filter(item => item.residentId === resident.id),
    reminders:(data.reminders || []).filter(item => item.residentId === resident.id),
    provider:data.provider || null,
  };
}
function applyTransaction(balance, transaction) {
  if (transaction.type === "restated") return Number(transaction.amount) || 0;
  if (transaction.type === "reversal") return balance + (Number(transaction.balanceEffect) || 0);
  if (transaction.type === "payment") return balance - (Number(transaction.amount) || 0);
  return balance + (Number(transaction.amount) || 0);
}
function statementFor(data, resident, from, to) {
  const rows = (data.transactions || []).filter(item => item.residentId === resident.id)
    .sort((a,b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  const openingRows = rows.filter(item => item.date < from || (item.date === from && ["openingBalance","restated"].includes(item.type)));
  const openingSet = new Set(openingRows);
  const opening = openingRows.reduce(applyTransaction, 0);
  const period = rows.filter(item => item.date >= from && item.date <= to && !openingSet.has(item));
  const charges = period.filter(item => item.type === "charge").reduce((sum,item) => sum + (Number(item.amount) || 0), 0);
  const payments = period.filter(item => item.type === "payment").reduce((sum,item) => sum + (Number(item.amount) || 0), 0);
  const adjustments = period.filter(item => item.type === "reversal").reduce((sum,item) => sum + (Number(item.balanceEffect) || 0), 0);
  const closing = period.reduce(applyTransaction, opening);
  const restatements = period.filter(item => item.type === "restated");
  return {resident, from, to, opening, charges, payments, adjustments, closing, restatements, transactions:period};
}
function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value;
}
function residentBalance(transactions, residentId) {
  return transactions.filter(item => item.residentId === residentId)
    .sort((a,b) => a.date.localeCompare(b.date))
    .reduce(applyTransaction,0);
}
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
function todayISO() { return new Date().toISOString().slice(0,10); }
// Parse and validate invoice allocations for a provider payment. Each allocation references an
// existing, non-void invoice; the sum of allocations may not exceed the payment amount, and an
// invoice may not be over-allocated beyond its outstanding balance. Returns {ok, allocations, error}.
function parseAllocations(rawAllocations, invoices, payments, paymentAmount, excludePaymentId) {
  const invoiceById = new Map((invoices || []).map(item => [item.id, item]));
  const allocations = [];
  if (rawAllocations === undefined || rawAllocations === null) return {ok:true, allocations};
  if (!Array.isArray(rawAllocations)) return {ok:false, error:"Allocations must be a list"};
  let total = 0;
  for (const raw of rawAllocations) {
    const invoiceId = String((raw && raw.invoiceId) || "");
    const amount = Number(raw && raw.amount);
    const invoice = invoiceById.get(invoiceId);
    if (!invoice) return {ok:false, error:"Allocation references an invoice that does not exist"};
    if (invoice.status === "void") return {ok:false, error:"Cannot allocate to a void invoice"};
    if (!Number.isSafeInteger(amount) || amount <= 0) return {ok:false, error:"Each allocation must be a positive whole KES value"};
    const alreadyAllocated = activeProviderPayments(payments)
      .filter(payment => payment.id !== excludePaymentId)
      .reduce((sum, payment) => sum + (payment.allocations || [])
        .filter(a => a.invoiceId === invoiceId).reduce((s, a) => s + (Number(a.amount) || 0), 0), 0);
    if (alreadyAllocated + amount > (Number(invoice.amount) || 0)) {
      return {ok:false, error:`Allocation exceeds the outstanding balance of invoice ${invoice.invoiceNumber || invoice.id}`};
    }
    total += amount;
    allocations.push({invoiceId, amount});
  }
  if (total > paymentAmount) return {ok:false, error:"Allocated total exceeds the payment amount"};
  return {ok:true, allocations};
}
const PROVIDER_INVOICE_STATUSES = ["open","void"];
function validBillingPeriod(value) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || "")); }
// A reversed provider payment no longer counts toward any invoice settlement.
function activeProviderPayments(payments) { return (payments || []).filter(item => item.status !== "reversed"); }
function invoiceAllocated(invoice, payments) {
  return activeProviderPayments(payments).reduce((sum, payment) =>
    sum + (payment.allocations || [])
      .filter(allocation => allocation.invoiceId === invoice.id)
      .reduce((s, allocation) => s + (Number(allocation.amount) || 0), 0), 0);
}
function invoiceOutstanding(invoice, payments) {
  if (!invoice || invoice.status === "void") return 0;
  return Math.max(0, (Number(invoice.amount) || 0) - invoiceAllocated(invoice, payments));
}
// Derived settlement status. An invoice is only "paid" when its remaining balance is zero.
function invoiceSettlement(invoice, payments, asOf = todayISO()) {
  const allocated = invoiceAllocated(invoice, payments);
  const outstanding = invoiceOutstanding(invoice, payments);
  let status;
  if (invoice.status === "void") status = "void";
  else if (outstanding === 0 && allocated > 0) status = "paid";
  else if (outstanding === 0 && allocated === 0 && (Number(invoice.amount) || 0) === 0) status = "paid";
  else if (allocated > 0) status = "partially-paid";
  else status = "unpaid";
  if ((status === "unpaid" || status === "partially-paid") && invoice.dueDate && invoice.dueDate < asOf) status = "overdue";
  return {allocated, outstanding, status};
}
// Estate/provider-level reconciliation. Keeps provider expenses entirely separate from
// resident charges and project contributions.
function providerReconciliation(provider, invoices, payments, asOf = todayISO()) {
  const list = invoices || [];
  const open = list.filter(item => item.status !== "void");
  const activePayments = activeProviderPayments(payments);
  const totalInvoiced = open.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalAllocated = activePayments.reduce((sum, payment) =>
    sum + (payment.allocations || []).reduce((s, allocation) => s + (Number(allocation.amount) || 0), 0), 0);
  const unallocatedPayments = activePayments.reduce((sum, payment) => {
    const allocated = (payment.allocations || []).reduce((s, allocation) => s + (Number(allocation.amount) || 0), 0);
    return sum + Math.max(0, (Number(payment.amount) || 0) - allocated);
  }, 0);
  const outstandingPayable = open.reduce((sum, item) => sum + invoiceOutstanding(item, payments), 0);
  const overduePayable = open.reduce((sum, item) => {
    const settlement = invoiceSettlement(item, payments, asOf);
    return settlement.status === "overdue" ? sum + settlement.outstanding : sum;
  }, 0);
  const ageing = {current:0,"1-30":0,"31-60":0,"61-90":0,"90+":0};
  open.forEach(item => {
    const {outstanding} = invoiceSettlement(item, payments, asOf);
    if (outstanding <= 0) return;
    const due = item.dueDate || item.invoiceDate || asOf;
    const days = Math.round((new Date(`${asOf}T00:00:00Z`) - new Date(`${due}T00:00:00Z`)) / 86400000);
    if (days <= 0) ageing.current += outstanding;
    else if (days <= 30) ageing["1-30"] += outstanding;
    else if (days <= 60) ageing["31-60"] += outstanding;
    else if (days <= 90) ageing["61-90"] += outstanding;
    else ageing["90+"] += outstanding;
  });
  return {
    contractedMonthlyCost: Number(provider && provider.monthlyCharge) || 0,
    totalInvoiced, totalAllocated, unallocatedPayments, outstandingPayable, overduePayable, ageing,
    invoiceCount: open.length,
    paymentCount: activePayments.length,
  };
}

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
      const user = {id:crypto.randomUUID(), email, name, role:"owner", estateId:estate.id, active:true, createdAt:new Date().toISOString(), passwordHash:await passwordHash(password)};
      db.estates.push({...estate, data:emptyData()}); db.users.push(user); writeDb(db);
      const session = sessionFor(user, db); audit(db, user, "auth.register"); writeDb(db);
      return json(res, 201, {...session, user:publicUser(user), data:emptyData()});
    }
    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const input = await body(req);
      const user = db.users.find(item => item.email === String(input.email || "").trim().toLowerCase());
      if (!user || !(await passwordMatches(String(input.password || ""), user.passwordHash))) return json(res, 401, {error:"Invalid email or password"});
      if (user.active === false) return json(res, 403, {error:"This account has been deactivated; contact an administrator"});
      const estate = db.estates.find(item => item.id === user.estateId);
      const session = sessionFor(user, db); audit(db, user, "auth.login"); writeDb(db);
      const data = dataForUser(user, estate?.data || emptyData());
      if (!data) return json(res, 403, {error:"This resident account is not linked to a valid resident record"});
      return json(res, 200, {...session, user:publicUser(user), data});
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
    const estateData = {...emptyData(),...(estate.data || {})};
    if (req.method === "GET" && url.pathname === "/api/me") {
      const data = dataForUser(user, estateData);
      if (!data) return json(res, 403, {error:"This resident account is not linked to a valid resident record"});
      return json(res, 200, {user:publicUser(user), data});
    }
    if (req.method === "GET" && url.pathname === "/api/residents") {
      if (user.role === "resident") return json(res, 403, {error:"Resident accounts cannot list estate residents"});
      return json(res, 200, {residents:estateData.residents});
    }
    if (req.method === "GET" && url.pathname === "/api/transactions") {
      const residentId = user.role === "resident" ? user.residentId : url.searchParams.get("residentId");
      const transactions = residentId
        ? estateData.transactions.filter(item => item.residentId === residentId)
        : estateData.transactions;
      return json(res, 200, {transactions});
    }
    if (req.method === "POST" && url.pathname === "/api/transactions") {
      if (!can(user,["owner","manager","accountant"])) return json(res,403,{error:"Your role cannot post financial transactions"});
      const input=await body(req);
      if (!estateData.residents.some(item=>item.id===String(input.residentId||""))) return json(res,400,{error:"A resident in this estate is required"});
      if (!validIsoDate(input.date) || !["charge","payment"].includes(input.type) || !Number.isSafeInteger(Number(input.amount)) || Number(input.amount)<=0) return json(res,400,{error:"A valid date, transaction type, and positive whole-KES amount are required"});
      if (estateData.transactions.some(item=>item.id===String(input.id||""))) return json(res,409,{error:"Transaction ID already exists"});
      const transaction={...input,id:String(input.id||crypto.randomUUID()),residentId:String(input.residentId),amount:Number(input.amount)};
      if (transaction.type === "charge") {
        transaction.security=Number(transaction.security)||0;
        transaction.others=Number(transaction.others)||0;
        if (!Number.isSafeInteger(transaction.security) || !Number.isSafeInteger(transaction.others) || transaction.security<0 || transaction.others<0 || transaction.security+transaction.others!==transaction.amount) return json(res,400,{error:"Charge split must be whole KES and match the total"});
      }
      estate.data.transactions=[...estateData.transactions,transaction];
      audit(db,user,"transaction.posted",{targetId:transaction.id,originalValue:null,newValue:transaction,reason:"Financial transaction posted"});
      writeDb(db);
      return json(res,201,{transaction,balance:residentBalance(estate.data.transactions,transaction.residentId)});
    }
    const correctionRoute=url.pathname.match(/^\/api\/transactions\/([^/]+)\/corrections$/);
    if(req.method==="POST"&&correctionRoute){
      if(!can(user,["owner","manager","accountant"]))return json(res,403,{error:"Your role cannot correct financial transactions"});
      const originalId=decodeURIComponent(correctionRoute[1]);
      const original=estateData.transactions.find(item=>item.id===originalId);
      if(!original)return json(res,404,{error:"Transaction not found"});
      if(!["charge","payment"].includes(original.type))return json(res,400,{error:"Opening and restated balances cannot be corrected through this workflow"});
      if(estateData.transactions.some(item=>item.reversalOf===original.id))return json(res,409,{error:"This transaction has already been reversed or corrected"});
      const input=await body(req);
      const reason=String(input.reason||"").trim();
      if(reason.length<5||reason.length>500)return json(res,400,{error:"A correction reason between 5 and 500 characters is required"});
      const correctionId=crypto.randomUUID();
      const now=new Date().toISOString();
      const date=now.slice(0,10);
      const reversal={id:crypto.randomUUID(),residentId:original.residentId,date,type:"reversal",amount:Number(original.amount),balanceEffect:original.type==="payment"?Number(original.amount):-Number(original.amount),note:`Reversal of ${original.id}`,reversalOf:original.id,correctionId,reason,recordedBy:{id:user.id,name:user.name},enteredAt:now};
      const additions=[reversal];
      if(input.replacement){
        const replacement=input.replacement;
        const residentId=String(replacement.residentId||original.residentId);
        const amount=Number(replacement.amount);
        const type=String(replacement.type||original.type);
        if(!estateData.residents.some(item=>item.id===residentId)||!validIsoDate(replacement.date)||!["charge","payment"].includes(type)||!Number.isSafeInteger(amount)||amount<=0)return json(res,400,{error:"Replacement must specify a valid resident, date, type, and positive whole-KES amount"});
        const security=type==="charge"?Number(replacement.security)||0:0;
        const others=type==="charge"?Number(replacement.others)||0:0;
        if(!Number.isSafeInteger(security)||!Number.isSafeInteger(others)||security<0||others<0||(type==="charge"&&security+others!==amount))return json(res,400,{error:"Replacement charge split must be whole KES and equal the amount"});
        additions.push({id:crypto.randomUUID(),residentId,date:replacement.date,type,amount,security,others,note:String(replacement.note||"Corrected transaction"),correctionId,corrects:original.id,reason,recordedBy:{id:user.id,name:user.name},enteredAt:now});
      }
      estate.data.transactions=[...estateData.transactions,...additions];
      audit(db,user,"transaction.corrected",{targetId:original.id,originalValue:original,newValue:additions,reason,correctionId});
      writeDb(db);
      return json(res,200,{original,transactions:additions,correctionId,balance:residentBalance(estate.data.transactions,original.residentId)});
    }
    if (req.method === "GET" && url.pathname === "/api/reports") {
      if (user.role === "resident") return json(res, 403, {error:"Resident accounts cannot access estate-wide reports"});
      return json(res, 200, {data:estateData});
    }
    if (req.method === "GET" && url.pathname === "/api/provider-payments") {
      if (user.role === "resident") return json(res, 403, {error:"Resident accounts cannot access provider payment records"});
      const providerPayments = [...(estateData.providerPayments || [])].sort((a,b) => b.date.localeCompare(a.date));
      return json(res, 200, {providerPayments, reconciliation:providerReconciliation(estateData.provider, estateData.providerInvoices, estateData.providerPayments)});
    }
    if (req.method === "POST" && url.pathname === "/api/provider-payments") {
      if (!can(user,["owner","manager","accountant"])) return json(res, 403, {error:"Your role cannot record provider payments"});
      const input = await body(req);
      const date = String(input.date || "");
      const parsedDate = new Date(`${date}T00:00:00Z`);
      const amount = Number(input.amount);
      const method = String(input.method || "");
      const reference = String(input.reference || "").trim();
      const billingPeriod = String(input.billingPeriod || "").trim();
      const notes = String(input.notes || "").trim();
      const idempotencyKey = String(input.idempotencyKey || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0,10) !== date) return json(res, 400, {error:"A valid payment date is required"});
      if (!Number.isSafeInteger(amount) || amount <= 0) return json(res, 400, {error:"Amount must be a positive whole KES value"});
      if (!["M-Pesa","Bank Transfer","Cash","Cheque","Other"].includes(method)) return json(res, 400, {error:"Select a valid payment method"});
      if (reference.length > 100 || notes.length > 500) return json(res, 400, {error:"Reference or notes exceed the allowed length"});
      if (billingPeriod && !/^\d{4}-(0[1-9]|1[0-2])$/.test(billingPeriod)) return json(res, 400, {error:"Billing period must use YYYY-MM"});
      if (idempotencyKey.length < 8 || idempotencyKey.length > 128) return json(res, 400, {error:"A valid idempotency key is required"});
      const providerPayments = estateData.providerPayments || [];
      const replay = providerPayments.find(item => item.idempotencyKey === idempotencyKey);
      if (replay) {
        const sameRequest = replay.date === date && replay.amount === amount && replay.method === method && replay.reference === reference && replay.billingPeriod === billingPeriod && replay.notes === notes;
        return sameRequest ? json(res, 200, {payment:replay,duplicate:true}) : json(res, 409, {error:"Idempotency key was already used for a different payment"});
      }
      if (reference && providerPayments.some(item => item.reference === reference)) return json(res, 409, {error:"A provider payment with this reference already exists"});
      const allocationResult = parseAllocations(input.allocations, estateData.providerInvoices, providerPayments, amount);
      if (!allocationResult.ok) return json(res, 400, {error:allocationResult.error});
      const payment = {
        id:crypto.randomUUID(), date, amount, method, reference, billingPeriod, notes,
        status:"recorded", verification:"not independently verified", idempotencyKey,
        allocations:allocationResult.allocations,
        recordedAt:new Date().toISOString(), recordedBy:{id:user.id,name:user.name},
      };
      estate.data.providerPayments = [...providerPayments,payment];
      audit(db,user,"provider.payment.recorded",{paymentId:payment.id,amount:payment.amount,billingPeriod:payment.billingPeriod,reference:payment.reference,allocations:payment.allocations});
      writeDb(db);
      return json(res,201,{payment,reconciliation:providerReconciliation(estateData.provider, estate.data.providerInvoices, estate.data.providerPayments)});
    }
    if (req.method === "GET" && url.pathname === "/api/provider-invoices") {
      if (user.role === "resident") return json(res, 403, {error:"Resident accounts cannot access provider invoices"});
      const invoices = (estateData.providerInvoices || [])
        .map(invoice => ({...invoice, settlement:invoiceSettlement(invoice, estateData.providerPayments)}))
        .sort((a,b) => String(b.invoiceDate).localeCompare(String(a.invoiceDate)));
      return json(res, 200, {invoices, reconciliation:providerReconciliation(estateData.provider, estateData.providerInvoices, estateData.providerPayments)});
    }
    if (req.method === "POST" && url.pathname === "/api/provider-invoices") {
      if (!can(user,["owner","manager","accountant"])) return json(res, 403, {error:"Your role cannot record provider invoices"});
      const input = await body(req);
      const invoiceNumber = String(input.invoiceNumber || "").trim();
      const billingPeriod = String(input.billingPeriod || "").trim();
      const invoiceDate = String(input.invoiceDate || "");
      const dueDate = String(input.dueDate || "");
      const amount = Number(input.amount);
      const description = String(input.description || "").trim();
      const attachmentRef = String(input.attachmentRef || "").trim();
      const notes = String(input.notes || "").trim();
      if (!invoiceNumber || invoiceNumber.length > 60) return json(res, 400, {error:"An invoice number up to 60 characters is required"});
      if (!validIsoDate(invoiceDate)) return json(res, 400, {error:"A valid invoice date is required"});
      if (dueDate && !validIsoDate(dueDate)) return json(res, 400, {error:"The due date must be a valid date"});
      if (dueDate && dueDate < invoiceDate) return json(res, 400, {error:"The due date cannot be before the invoice date"});
      if (!Number.isSafeInteger(amount) || amount <= 0) return json(res, 400, {error:"Amount must be a positive whole KES value"});
      if (!validBillingPeriod(billingPeriod)) return json(res, 400, {error:"Billing period must use YYYY-MM"});
      if (description.length > 300 || notes.length > 500 || attachmentRef.length > 200) return json(res, 400, {error:"Description, notes, or attachment reference exceed the allowed length"});
      const invoices = estateData.providerInvoices || [];
      if (invoices.some(item => item.invoiceNumber.toLowerCase() === invoiceNumber.toLowerCase())) return json(res, 409, {error:"An invoice with this number already exists"});
      const invoice = {
        id:crypto.randomUUID(), providerId:estate.id, invoiceNumber, billingPeriod, invoiceDate,
        ...(dueDate ? {dueDate} : {}), amount, status:"open", description, attachmentRef, notes,
        createdAt:new Date().toISOString(), createdBy:{id:user.id, name:user.name},
      };
      estate.data.providerInvoices = [...invoices, invoice];
      audit(db, user, "provider.invoice.created", {invoiceId:invoice.id, invoiceNumber, amount, billingPeriod});
      writeDb(db);
      return json(res, 201, {invoice:{...invoice, settlement:invoiceSettlement(invoice, estateData.providerPayments)}, reconciliation:providerReconciliation(estateData.provider, estate.data.providerInvoices, estate.data.providerPayments)});
    }
    const invoiceRoute = url.pathname.match(/^\/api\/provider-invoices\/([^/]+)$/);
    if (invoiceRoute) {
      if (user.role === "resident") return json(res, 403, {error:"Resident accounts cannot access provider invoices"});
      const invoiceId = decodeURIComponent(invoiceRoute[1]);
      const invoice = (estateData.providerInvoices || []).find(item => item.id === invoiceId);
      if (!invoice) return json(res, 404, {error:"Invoice not found"});
      if (req.method === "PATCH" || req.method === "PUT") {
        if (!can(user,["owner","manager","accountant"])) return json(res, 403, {error:"Your role cannot correct provider invoices"});
        const input = await body(req);
        const before = {...invoice};
        const allocated = invoiceAllocated(invoice, estateData.providerPayments);
        if ("status" in input) {
          if (!PROVIDER_INVOICE_STATUSES.includes(input.status)) return json(res, 400, {error:"Select a valid invoice status"});
          if (input.status === "void" && allocated > 0) return json(res, 409, {error:"An invoice with recorded payments cannot be voided; reverse the payments first"});
          invoice.status = input.status;
        }
        if ("amount" in input) {
          const amount = Number(input.amount);
          if (!Number.isSafeInteger(amount) || amount <= 0) return json(res, 400, {error:"Amount must be a positive whole KES value"});
          if (amount < allocated) return json(res, 409, {error:"Invoice amount cannot be less than the amount already paid against it"});
          invoice.amount = amount;
        }
        if ("dueDate" in input) {
          const dueDate = String(input.dueDate || "");
          if (dueDate && !validIsoDate(dueDate)) return json(res, 400, {error:"The due date must be a valid date"});
          invoice.dueDate = dueDate || undefined;
        }
        if ("description" in input) invoice.description = String(input.description || "").trim().slice(0,300);
        if ("notes" in input) invoice.notes = String(input.notes || "").trim().slice(0,500);
        if ("attachmentRef" in input) invoice.attachmentRef = String(input.attachmentRef || "").trim().slice(0,200);
        invoice.updatedAt = new Date().toISOString();
        invoice.updatedBy = {id:user.id, name:user.name};
        audit(db, user, "provider.invoice.updated", {invoiceId:invoice.id, before, after:invoice});
        writeDb(db);
        return json(res, 200, {invoice:{...invoice, settlement:invoiceSettlement(invoice, estateData.providerPayments)}, reconciliation:providerReconciliation(estateData.provider, estate.data.providerInvoices, estate.data.providerPayments)});
      }
      return json(res, 405, {error:"Method not allowed"});
    }
    const allocateRoute = url.pathname.match(/^\/api\/provider-payments\/([^/]+)\/allocations$/);
    if (req.method === "POST" && allocateRoute) {
      if (!can(user,["owner","manager","accountant"])) return json(res, 403, {error:"Your role cannot allocate provider payments"});
      const payment = (estateData.providerPayments || []).find(item => item.id === decodeURIComponent(allocateRoute[1]));
      if (!payment) return json(res, 404, {error:"Payment not found"});
      if (payment.status === "reversed") return json(res, 409, {error:"A reversed payment cannot be allocated"});
      const input = await body(req);
      const allocationResult = parseAllocations(input.allocations, estateData.providerInvoices, estateData.providerPayments, Number(payment.amount), payment.id);
      if (!allocationResult.ok) return json(res, 400, {error:allocationResult.error});
      const before = payment.allocations || [];
      payment.allocations = allocationResult.allocations;
      payment.allocatedAt = new Date().toISOString();
      payment.allocatedBy = {id:user.id, name:user.name};
      audit(db, user, "provider.payment.allocated", {paymentId:payment.id, before, after:payment.allocations});
      writeDb(db);
      return json(res, 200, {payment, reconciliation:providerReconciliation(estateData.provider, estate.data.providerInvoices, estate.data.providerPayments)});
    }
    const reverseRoute = url.pathname.match(/^\/api\/provider-payments\/([^/]+)\/reversals$/);
    if (req.method === "POST" && reverseRoute) {
      if (!can(user,["owner","manager","accountant"])) return json(res, 403, {error:"Your role cannot reverse provider payments"});
      const payment = (estateData.providerPayments || []).find(item => item.id === decodeURIComponent(reverseRoute[1]));
      if (!payment) return json(res, 404, {error:"Payment not found"});
      if (payment.status === "reversed") return json(res, 409, {error:"This payment has already been reversed"});
      const input = await body(req);
      const reason = String(input.reason || "").trim();
      if (reason.length < 5 || reason.length > 500) return json(res, 400, {error:"A reversal reason between 5 and 500 characters is required"});
      payment.status = "reversed";
      payment.reversal = {reason, reversedAt:new Date().toISOString(), reversedBy:{id:user.id, name:user.name}};
      audit(db, user, "provider.payment.reversed", {paymentId:payment.id, amount:payment.amount, reason});
      writeDb(db);
      return json(res, 200, {payment, reconciliation:providerReconciliation(estateData.provider, estate.data.providerInvoices, estate.data.providerPayments)});
    }
    if (req.method === "GET" && url.pathname === "/api/search") {
      const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
      const permitted = dataForUser(user, estateData);
      if (!permitted) return json(res, 403, {error:"This resident account is not linked to a valid resident record"});
      const residents = permitted.residents.filter(item => `${item.name} ${item.unit}`.toLowerCase().includes(query));
      const transactions = permitted.transactions.filter(item => `${item.note || ""} ${item.mpesa || ""} ${item.date || ""}`.toLowerCase().includes(query));
      return json(res, 200, {residents,transactions});
    }
    const statementRoute = url.pathname.match(/^\/api\/residents\/([^/]+)\/(transactions|statement)$/);
    if (req.method === "GET" && statementRoute) {
      const requestedId = decodeURIComponent(statementRoute[1]);
      if (user.role === "resident" && requestedId !== user.residentId) return json(res, 404, {error:"Resident record not found"});
      const resident = estateData.residents.find(item => item.id === requestedId);
      if (!resident) return json(res, 404, {error:"Resident record not found"});
      if (statementRoute[2] === "transactions") {
        return json(res, 200, {transactions:estateData.transactions.filter(item => item.residentId === resident.id)});
      }
      const from = url.searchParams.get("from") || "0000-01-01";
      const to = url.searchParams.get("to") || "9999-12-31";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return json(res, 400, {error:"A valid reporting period is required"});
      return json(res, 200, {statement:statementFor(estateData,resident,from,to)});
    }
    const residentRoute = url.pathname.match(/^\/api\/residents\/([^/]+)$/);
    if (req.method === "GET" && residentRoute) {
      const requestedId = decodeURIComponent(residentRoute[1]);
      if (user.role === "resident" && requestedId !== user.residentId) return json(res, 404, {error:"Resident record not found"});
      const resident = estateData.residents.find(item => item.id === requestedId);
      return resident ? json(res, 200, {resident}) : json(res, 404, {error:"Resident record not found"});
    }
    const transactionRoute = url.pathname.match(/^\/api\/transactions\/([^/]+)$/);
    if (req.method === "GET" && transactionRoute) {
      const transaction = estateData.transactions.find(item => item.id === decodeURIComponent(transactionRoute[1]));
      if (!transaction || (user.role === "resident" && transaction.residentId !== user.residentId)) return json(res, 404, {error:"Transaction not found"});
      return json(res, 200, {transaction});
    }
    const receiptRoute = url.pathname.match(/^\/api\/receipts\/([^/]+)$/);
    if (req.method === "GET" && receiptRoute) {
      const transaction = estateData.transactions.find(item => item.id === decodeURIComponent(receiptRoute[1]) && item.type === "payment");
      if (!transaction || (user.role === "resident" && transaction.residentId !== user.residentId)) return json(res, 404, {error:"Receipt not found"});
      const resident = estateData.residents.find(item => item.id === transaction.residentId);
      return json(res, 200, {receipt:{receiptNumber:`RCPT-${transaction.id}`,transaction,resident,verification:"manually recorded; not independently verified"}});
    }
    if (req.method === "PUT" && url.pathname === "/api/data") {
      if (!can(user, ["owner", "manager", "accountant"])) return json(res, 403, {error:"Your role cannot edit estate data"});
      const input = await body(req);
      if (!Array.isArray(input.residents) || !Array.isArray(input.transactions)) return json(res,400,{error:"Resident and transaction arrays are required"});
      const residentIds=new Set(input.residents.map(item=>String(item.id||"")));
      const submittedById=new Map();
      for(const item of input.transactions){
        const id=String(item.id||"");
        if(!id||submittedById.has(id))return json(res,400,{error:"Transactions must have unique IDs"});
        submittedById.set(id,item);
      }
      const existingById=new Map(estateData.transactions.map(item=>[String(item.id),item]));
      for(const [id,existing] of existingById){
        const submitted=submittedById.get(id);
        if(!submitted)return json(res,409,{error:"Posted transactions cannot be deleted; use a reversal or correction"});
        if(!isDeepStrictEqual(existing,submitted))return json(res,409,{error:"Posted transactions cannot be overwritten; use a reason-required correction"});
      }
      const newTransactions=input.transactions.filter(item=>!existingById.has(String(item.id)));
      for(const item of newTransactions){
        const amount=Number(item.amount);
        if(!residentIds.has(String(item.residentId||""))||!validIsoDate(item.date)||!Number.isSafeInteger(amount)||!["charge","payment","openingBalance","restated","reversal"].includes(item.type))return json(res,400,{error:"New transactions require a valid resident, date, type, and whole-KES amount"});
        if(["charge","payment"].includes(item.type)&&amount<=0)return json(res,400,{error:"Charges and payments must be positive whole-KES values"});
        if(item.type==="reversal"&&(!Number.isSafeInteger(Number(item.balanceEffect))||!item.reversalOf||!item.correctionId))return json(res,400,{error:"Reversal entries must be linked to an audited correction"});
      }
      estate.data = {residents:input.residents, transactions:input.transactions, projects:Array.isArray(input.projects)?input.projects:[], contribs:Array.isArray(input.contribs)?input.contribs:[], reminders:Array.isArray(input.reminders)?input.reminders:[], provider:input.provider && typeof input.provider === "object" && !Array.isArray(input.provider) ? input.provider : estateData.provider || null, providerPayments:estateData.providerPayments || [], providerInvoices:estateData.providerInvoices || []};
      newTransactions.forEach(transaction=>audit(db,user,"transaction.posted",{targetId:transaction.id,originalValue:null,newValue:transaction,reason:"Posted through authenticated estate data sync"}));
      audit(db, user, "data.replace", {counts:Object.fromEntries(Object.entries(estate.data).map(([key,value]) => [key,value.length]))});
      writeDb(db); return json(res, 200, {data:estate.data});
    }
    if (req.method === "POST" && url.pathname === "/api/reminders") {
      if (!can(user, ["owner", "manager", "accountant"])) return json(res, 403, {error:"Your role cannot create reminders"});
      const input = await body(req);
      if (!estateData.residents.some(item => item.id === String(input.residentId || ""))) return json(res, 400, {error:"A resident in this estate is required"});
      const reminder = {id:crypto.randomUUID(), estateId:estate.id, residentId:String(input.residentId || ""), channel:String(input.channel || "log"), message:String(input.message || ""), createdAt:new Date().toISOString(), status:"logged"};
      db.reminders.push(reminder); audit(db, user, "reminder.create", {reminderId:reminder.id}); writeDb(db); return json(res, 201, {reminder});
    }
    if (req.method === "GET" && url.pathname === "/api/audit") {
      if (!can(user, ["owner", "manager"])) return json(res, 403, {error:"Your role cannot view the audit log"});
      let log = db.auditLog.filter(item => item.estateId === user.estateId);
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const userId = url.searchParams.get("userId");
      const action = url.searchParams.get("action");
      const recordType = url.searchParams.get("recordType");
      const search = String(url.searchParams.get("q") || "").trim().toLowerCase();
      if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) log = log.filter(item => String(item.createdAt).slice(0,10) >= from);
      if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) log = log.filter(item => String(item.createdAt).slice(0,10) <= to);
      if (userId) log = log.filter(item => item.userId === userId);
      if (action) log = log.filter(item => item.action === action);
      if (recordType) log = log.filter(item => String(item.action).startsWith(recordType));
      if (search) log = log.filter(item => JSON.stringify({action:item.action, details:item.details}).toLowerCase().includes(search));
      log.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const total = log.length;
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 1), 500);
      const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10) || 1, 1);
      const start = (page - 1) * limit;
      const userById = new Map(db.users.map(item => [item.id, item]));
      const items = log.slice(start, start + limit).map(item => ({
        ...item,
        userName: userById.get(item.userId)?.name || null,
        userEmail: userById.get(item.userId)?.email || null,
      }));
      const users = db.users.filter(item => item.estateId === user.estateId).map(item => ({id:item.id, name:item.name, email:item.email, role:item.role}));
      const actions = [...new Set(db.auditLog.filter(item => item.estateId === user.estateId).map(item => item.action))].sort();
      return json(res, 200, {auditLog:items, total, page, limit, users, actions});
    }
    if (req.method === "GET" && url.pathname === "/api/members") {
      if (!can(user, ["owner", "manager"])) return json(res, 403, {error:"Your role cannot view members"});
      return json(res, 200, {members:db.users.filter(item => item.estateId === user.estateId).map(publicUser)});
    }
    if (req.method === "POST" && url.pathname === "/api/members") {
      if (!can(user, ["owner"])) return json(res, 403, {error:"Only an estate owner can invite members"});
      const input = await body(req);
      const email = String(input.email || "").trim().toLowerCase();
      const role = ["manager", "accountant", "viewer", "resident"].includes(input.role) ? input.role : "viewer";
      if (!email || String(input.password || "").length < 8) return json(res, 400, {error:"Member email and an 8-character password are required"});
      if (db.users.some(item => item.email === email)) return json(res, 409, {error:"An account with that email already exists"});
      let residentId;
      if (role === "resident") {
        residentId = String(input.residentId || "");
        if (!estateData.residents.some(item => item.id === residentId)) return json(res, 400, {error:"Resident accounts must be linked to an existing resident in this estate"});
        if (db.users.some(item => item.estateId === estate.id && item.role === "resident" && item.residentId === residentId)) return json(res, 409, {error:"A resident login is already linked to this resident"});
      }
      const member = {id:crypto.randomUUID(), email, name:String(input.name || email).trim(), role, estateId:user.estateId, active:true, createdAt:new Date().toISOString(), ...(residentId ? {residentId} : {}), passwordHash:await passwordHash(String(input.password))};
      db.users.push(member); audit(db, user, "member.create", {memberId:member.id, role, residentId:residentId || null}); writeDb(db);
      return json(res, 201, {member:publicUser(member)});
    }
    // ── Member management: link, unlink, correct role, activate/deactivate, remove ──
    // Owner-only. Every change is audited server-side; no passwords/hashes/tokens are exposed.
    const memberRoute = url.pathname.match(/^\/api\/members\/([^/]+)$/);
    if (memberRoute) {
      const targetId = decodeURIComponent(memberRoute[1]);
      const target = db.users.find(item => item.id === targetId && item.estateId === user.estateId);
      if (!target) return json(res, 404, {error:"Account not found"});
      if (!can(user, ["owner"])) return json(res, 404, {error:"Account not found"});
      if (req.method === "PATCH" || req.method === "PUT") {
        const input = await body(req);
        const before = publicUser(target);
        // An owner may never change their own role or deactivate their own account.
        if (target.id === user.id && (("role" in input) || input.active === false)) {
          return json(res, 409, {error:"You cannot change your own role or deactivate your own account"});
        }
        // Only a manager/owner tier may hold the "owner" role, and it can never be granted here.
        if ("role" in input && !["manager", "accountant", "viewer", "resident"].includes(input.role)) {
          return json(res, 400, {error:"Select a valid role (manager, accountant, viewer, or resident)"});
        }
        const nextRole = "role" in input ? input.role : target.role;
        let nextResidentId = target.residentId;
        if (nextRole === "resident") {
          const requestedResident = String(input.residentId || target.residentId || "");
          if (!estateData.residents.some(item => item.id === requestedResident)) {
            return json(res, 400, {error:"Resident accounts must be linked to an existing resident in this estate"});
          }
          if (db.users.some(item => item.id !== target.id && item.estateId === estate.id && item.role === "resident" && item.residentId === requestedResident)) {
            return json(res, 409, {error:"Another account is already linked to this resident"});
          }
          nextResidentId = requestedResident;
        } else if ("residentId" in input && input.residentId) {
          return json(res, 400, {error:"Only resident accounts can be linked to a resident record"});
        } else {
          nextResidentId = undefined;
        }
        const active = "active" in input ? Boolean(input.active) : target.active !== false;
        target.role = nextRole;
        target.active = active;
        if (nextResidentId) target.residentId = nextResidentId; else delete target.residentId;
        audit(db, user, "member.update", {memberId:target.id, before, after:publicUser(target)});
        writeDb(db);
        return json(res, 200, {member:publicUser(target)});
      }
      if (req.method === "DELETE") {
        if (!target) return json(res, 404, {error:"Account not found"});
        if (target.id === user.id) return json(res, 409, {error:"You cannot remove your own account"});
        // Never delete financial records; only the account mapping is removed.
        db.users = db.users.filter(item => item.id !== target.id);
        db.refreshTokens = db.refreshTokens.filter(item => item.userId !== target.id);
        audit(db, user, "member.remove", {memberId:target.id, role:target.role, residentId:target.residentId || null, note:"Account mapping removed; financial records retained"});
        writeDb(db);
        return json(res, 200, {removed:publicUser(target)});
      }
      return json(res, 405, {error:"Method not allowed"});
    }
    return json(res, 404, {error:"Route not found"});
  } catch (error) {
    return json(res, error.message === "Invalid JSON" ? 400 : 500, {error:error.message || "Server error"});
  }
}

if (require.main === module) {
  http.createServer(handle).listen(PORT, HOST, () => console.log(`Lemayian Court API listening on http://${HOST}:${PORT}`));
}

module.exports = {handle, dataForUser, statementFor};
