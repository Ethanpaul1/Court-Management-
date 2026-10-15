const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const {after, before, test} = require("node:test");

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lemayian-api-security-"));
process.env.DATA_FILE = path.join(testDirectory, "data.json");
process.env.BACKUP_DIR = path.join(testDirectory, "backups");
process.env.JWT_SECRET = "test-only-signing-secret-not-for-production";
process.env.CORS_ORIGIN = "http://localhost:3000";

const {handle,statementFor} = require("./index.js");
let server;
let baseUrl;
let ownerToken;
let viewerToken;
let residentOneToken;
let residentTwoToken;
let residentOneMember;
let residentTwoMember;

async function request(route, {method="GET",token,body}={}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers:{
      ...(token ? {Authorization:`Bearer ${token}`} : {}),
      ...(body ? {"Content-Type":"application/json"} : {}),
    },
    ...(body ? {body:JSON.stringify(body)} : {}),
  });
  return {status:response.status, data:await response.json()};
}

async function registerMember(owner, {email,role,residentId}) {
  const result = await request("/api/members", {
    method:"POST",
    token:owner,
    body:{email,name:email.split("@")[0],password:"Test-Password-123!",role,residentId},
  });
  assert.equal(result.status,201);
  const login = await request("/api/auth/login", {
    method:"POST",
    body:{email,password:"Test-Password-123!"},
  });
  assert.equal(login.status,200);
  return {token:login.data.accessToken,member:result.data.member};
}

before(async () => {
  server = http.createServer(handle);
  await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const owner = await request("/api/auth/register", {
    method:"POST",
    body:{name:"Treasurer",estateName:"Security Test Estate",email:"owner@test.invalid",password:"Test-Password-123!"},
  });
  assert.equal(owner.status,201);
  ownerToken = owner.data.accessToken;

  const data = await request("/api/data", {
    method:"PUT",
    token:ownerToken,
    body:{
      residents:[{id:"resident-a",name:"Resident A",unit:"A1"},{id:"resident-b",name:"Resident B",unit:"A2"}],
      transactions:[
        {id:"charge-a",residentId:"resident-a",date:"2026-01-01",type:"charge",amount:1000,note:"January levy"},
        {id:"payment-a",residentId:"resident-a",date:"2026-01-10",type:"payment",amount:200,note:"Payment",mpesa:"REF-A"},
        {id:"charge-b",residentId:"resident-b",date:"2026-01-01",type:"charge",amount:500,note:"January levy"},
        {id:"payment-b",residentId:"resident-b",date:"2026-01-12",type:"payment",amount:75,note:"Payment",mpesa:"REF-B"},
      ],
      projects:[{id:"project-secret",name:"Private project"}],
      contribs:[{id:"contribution-a",residentId:"resident-a",amount:100}],
      reminders:[],
      provider:{name:"Provider"},
    },
  });
  assert.equal(data.status,200);

  const viewer = await registerMember(ownerToken,{email:"viewer@test.invalid",role:"viewer"});
  viewerToken = viewer.token;
  const residentOne = await registerMember(ownerToken,{email:"resident-a@test.invalid",role:"resident",residentId:"resident-a"});
  residentOneToken = residentOne.token;
  residentOneMember = residentOne.member;
  const residentTwo = await registerMember(ownerToken,{email:"resident-b@test.invalid",role:"resident",residentId:"resident-b"});
  residentTwoToken = residentTwo.token;
  residentTwoMember = residentTwo.member;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  fs.rmSync(testDirectory,{recursive:true,force:true});
});

test("resident identity is bound to the server-linked resident and own data only", async () => {
  const result = await request("/api/me",{token:residentOneToken});
  assert.equal(result.status,200);
  assert.equal(result.data.user.residentId,"resident-a");
  assert.deepEqual(result.data.data.residents.map(item=>item.id),["resident-a"]);
  assert.deepEqual(result.data.data.transactions.map(item=>item.id),["charge-a","payment-a"]);
  assert.deepEqual(result.data.data.projects,[]);
  assert.deepEqual(result.data.data.contribs.map(item=>item.id),["contribution-a"]);
});

test("resident cannot list estate residents, transactions, or reports", async () => {
  assert.equal((await request("/api/residents",{token:residentOneToken})).status,403);
  assert.equal((await request("/api/reports",{token:residentOneToken})).status,403);
  const transactions = await request("/api/transactions?residentId=resident-b",{token:residentOneToken});
  assert.equal(transactions.status,200);
  assert.deepEqual(transactions.data.transactions.map(item=>item.id),["charge-a","payment-a"]);
  const search = await request("/api/search?q=Resident%20B",{token:residentOneToken});
  assert.equal(search.status,200);
  assert.deepEqual(search.data.residents,[]);
});

test("resident can read own account and cannot address another resident", async () => {
  assert.equal((await request("/api/residents/resident-a",{token:residentOneToken})).status,200);
  assert.equal((await request("/api/residents/resident-b",{token:residentOneToken})).status,404);
  assert.equal((await request("/api/residents/resident-a/transactions",{token:residentOneToken})).status,200);
  assert.equal((await request("/api/residents/resident-b/transactions",{token:residentOneToken})).status,404);
  assert.equal((await request("/api/residents/resident-b/statement?from=2026-01-01&to=2026-01-31",{token:residentOneToken})).status,404);
});

test("resident statement calculates charges, payments, and closing balance from their ledger", async () => {
  const result = await request("/api/residents/resident-a/statement?from=2026-01-01&to=2026-01-31",{token:residentOneToken});
  assert.equal(result.status,200);
  assert.equal(result.data.statement.opening,0);
  assert.equal(result.data.statement.charges,1000);
  assert.equal(result.data.statement.payments,200);
  assert.equal(result.data.statement.closing,800);
  assert.deepEqual(result.data.statement.transactions.map(item=>item.residentId),["resident-a","resident-a"]);
});

test("period-start b/fwd is included in opening balance, not period activity", () => {
  const resident={id:"resident-a",name:"Resident A",unit:"A1"};
  const data={transactions:[
    {id:"opening",residentId:"resident-a",date:"2026-01-01",type:"openingBalance",amount:4000},
    {id:"charge",residentId:"resident-a",date:"2026-01-01",type:"charge",amount:4000},
    {id:"payment",residentId:"resident-a",date:"2026-01-15",type:"payment",amount:2000},
  ]};
  const statement=statementFor(data,resident,"2026-01-01","2026-01-31");
  assert.equal(statement.opening,4000);
  assert.equal(statement.charges,4000);
  assert.equal(statement.payments,2000);
  assert.equal(statement.closing,6000);
  assert.deepEqual(statement.transactions.map(item=>item.id),["charge","payment"]);
});

test("resident cannot retrieve another resident transaction or receipt", async () => {
  assert.equal((await request("/api/transactions/charge-b",{token:residentOneToken})).status,404);
  assert.equal((await request("/api/receipts/payment-b",{token:residentOneToken})).status,404);
  const ownReceipt = await request("/api/receipts/payment-a",{token:residentOneToken});
  assert.equal(ownReceipt.status,200);
  assert.equal(ownReceipt.data.receipt.transaction.residentId,"resident-a");
  assert.match(ownReceipt.data.receipt.verification,/not independently verified/);
});

test("resident cannot write financial data, reminders, or member mappings", async () => {
  assert.equal((await request("/api/data",{method:"PUT",token:residentOneToken,body:{residents:[],transactions:[]}})).status,403);
  assert.equal((await request("/api/reminders",{method:"POST",token:residentOneToken,body:{residentId:"resident-a"}})).status,403);
  assert.equal((await request("/api/members",{method:"POST",token:residentOneToken,body:{email:"attacker@test.invalid",password:"Test-Password-123!",role:"owner",residentId:"resident-b"}})).status,403);
  assert.equal((await request(`/api/members/${residentOneMember.id}`,{method:"PUT",token:residentOneToken,body:{role:"owner",residentId:"resident-b"}})).status,404);
  const members = await request("/api/members",{token:ownerToken});
  assert.equal(members.data.members.find(item=>item.id===residentOneMember.id).role,"resident");
  assert.equal(members.data.members.find(item=>item.id===residentOneMember.id).residentId,"resident-a");
  assert.equal(members.data.members.find(item=>item.id===residentTwoMember.id).residentId,"resident-b");
});

test("resident linking requires an existing estate resident and rejects duplicate mappings", async () => {
  assert.equal((await request("/api/members",{method:"POST",token:ownerToken,body:{email:"bad-link@test.invalid",password:"Test-Password-123!",role:"resident",residentId:"other-estate-id"}})).status,400);
  assert.equal((await request("/api/members",{method:"POST",token:ownerToken,body:{email:"duplicate-link@test.invalid",password:"Test-Password-123!",role:"resident",residentId:"resident-a"}})).status,409);
  const nonResident = await request("/api/members",{method:"POST",token:ownerToken,body:{email:"ordinary-viewer@test.invalid",password:"Test-Password-123!",role:"viewer",residentId:"resident-b"}});
  assert.equal(nonResident.status,201);
  assert.equal(Object.hasOwn(nonResident.data.member,"residentId"),false);
});

test("unauthenticated requests cannot access protected resident or estate data", async () => {
  for (const route of ["/api/me","/api/residents","/api/transactions","/api/reports","/api/search?q=A1","/api/provider-payments","/api/receipts/payment-a"]) {
    assert.equal((await request(route)).status,401,route);
  }
  const protectedWrites=[
    ["PUT","/api/data",{residents:[],transactions:[]}],
    ["POST","/api/transactions",{residentId:"resident-a",date:"2026-01-01",type:"payment",amount:100}],
    ["POST","/api/transactions/charge-a/corrections",{reason:"Correct transaction"}],
    ["POST","/api/provider-payments",{date:"2026-01-01",amount:100,method:"M-Pesa",idempotencyKey:"unauth-provider-001"}],
    ["POST","/api/members",{email:"unauth@test.invalid",password:"Test-Password-123!"}],
    ["POST","/api/reminders",{residentId:"resident-a"}],
  ];
  for (const [method,route,body] of protectedWrites) assert.equal((await request(route,{method,body})).status,401,`${method} ${route}`);
});

test("provider payments validate, persist, record attribution, and are idempotent", async () => {
  const invalidAmount = await request("/api/provider-payments",{method:"POST",token:ownerToken,body:{date:"2026-02-01",amount:123.5,method:"M-Pesa",idempotencyKey:"invalid-amount"}});
  assert.equal(invalidAmount.status,400);
  const invalidDate = await request("/api/provider-payments",{method:"POST",token:ownerToken,body:{date:"2026-02-30",amount:12000,method:"M-Pesa",idempotencyKey:"invalid-date"}});
  assert.equal(invalidDate.status,400);
  const payload={date:"2026-02-01",amount:30000,method:"M-Pesa",reference:"PROVIDER-REF-1",billingPeriod:"2026-01",notes:"January security service",idempotencyKey:"provider-payment-001"};
  const created=await request("/api/provider-payments",{method:"POST",token:ownerToken,body:payload});
  assert.equal(created.status,201);
  assert.equal(created.data.payment.status,"recorded");
  assert.equal(created.data.payment.verification,"not independently verified");
  assert.equal(created.data.payment.recordedBy.name,"Treasurer");
  const replay=await request("/api/provider-payments",{method:"POST",token:ownerToken,body:payload});
  assert.equal(replay.status,200);
  assert.equal(replay.data.duplicate,true);
  const duplicateReference=await request("/api/provider-payments",{method:"POST",token:ownerToken,body:{...payload,idempotencyKey:"provider-payment-002"}});
  assert.equal(duplicateReference.status,409);
  const list=await request("/api/provider-payments",{token:ownerToken});
  assert.equal(list.status,200);
  assert.equal(list.data.providerPayments.length,1);
  assert.equal(list.data.providerPayments[0].id,created.data.payment.id);
});

test("provider payments are visible to staff but never to resident accounts", async () => {
  assert.equal((await request("/api/provider-payments",{token:viewerToken})).status,200);
  assert.equal((await request("/api/provider-payments",{token:residentOneToken})).status,403);
  assert.equal((await request("/api/provider-payments",{method:"POST",token:viewerToken,body:{}})).status,403);
});

test("viewer is read-only and treasurer workflows remain available", async () => {
  assert.equal((await request("/api/residents",{token:viewerToken})).status,200);
  assert.equal((await request("/api/reports",{token:viewerToken})).status,200);
  assert.equal((await request("/api/data",{method:"PUT",token:viewerToken,body:{residents:[],transactions:[]}})).status,403);
  assert.equal((await request("/api/transactions/payment-a",{method:"DELETE",token:viewerToken})).status,404);
  const allTransactions = await request("/api/transactions",{token:ownerToken});
  assert.equal(allTransactions.status,200);
  assert.equal(allTransactions.data.transactions.length,4);
  const update = await request("/api/data",{method:"PUT",token:ownerToken,body:{residents:[{id:"resident-a",name:"Resident A",unit:"A1"},{id:"resident-b",name:"Resident B",unit:"A2"}],transactions:allTransactions.data.transactions,provider:{name:"Updated Provider"}}});
  assert.equal(update.status,200);
  assert.equal(update.data.data.provider.name,"Updated Provider");
  assert.equal(update.data.data.providerPayments.length,1);
  const reminder = await request("/api/reminders",{method:"POST",token:ownerToken,body:{residentId:"resident-a",message:"Reminder",channel:"log"}});
  assert.equal(reminder.status,201);
});

test("whole-data sync cannot edit or delete a posted transaction", async () => {
  const snapshot=(await request("/api/me",{token:ownerToken})).data.data;
  const changed=snapshot.transactions.map(item=>item.id==="charge-a"?{...item,amount:9999}:item);
  const overwrite=await request("/api/data",{method:"PUT",token:ownerToken,body:{...snapshot,transactions:changed}});
  assert.equal(overwrite.status,409);
  const deleted=await request("/api/data",{method:"PUT",token:ownerToken,body:{...snapshot,transactions:snapshot.transactions.filter(item=>item.id!=="charge-a")}});
  assert.equal(deleted.status,409);
  const stored=await request("/api/transactions/charge-a",{token:ownerToken});
  assert.equal(stored.data.transaction.amount,1000);
});

test("corrections require a reason, append reversal and replacement, recalculate balance, and audit values", async () => {
  assert.equal((await request("/api/transactions/charge-a/corrections",{method:"POST",token:viewerToken,body:{reason:"Correct entry"}})).status,403);
  assert.equal((await request("/api/transactions/charge-a/corrections",{method:"POST",token:residentOneToken,body:{reason:"Correct entry"}})).status,403);
  assert.equal((await request("/api/transactions/charge-a/corrections",{method:"POST",body:{reason:"Correct entry"}})).status,401);
  assert.equal((await request("/api/transactions/charge-a/corrections",{method:"POST",token:ownerToken,body:{reason:"bad"}})).status,400);

  const corrected=await request("/api/transactions/charge-a/corrections",{
    method:"POST",token:ownerToken,
    body:{reason:"Corrected amount to match approved levy record",replacement:{residentId:"resident-a",date:"2026-01-01",type:"charge",amount:1200,security:1000,others:200,note:"Corrected January levy"}},
  });
  assert.equal(corrected.status,200);
  assert.equal(corrected.data.balance,1000);
  assert.equal(corrected.data.transactions.length,2);
  assert.equal(corrected.data.transactions[0].type,"reversal");
  assert.equal(corrected.data.transactions[0].balanceEffect,-1000);
  assert.equal(corrected.data.transactions[1].amount,1200);
  const statement=await request("/api/residents/resident-a/statement?from=2026-01-01&to=2026-12-31",{token:ownerToken});
  assert.equal(statement.data.statement.charges,2200);
  assert.equal(statement.data.statement.payments,200);
  assert.equal(statement.data.statement.adjustments,-1000);
  assert.equal(statement.data.statement.closing,1000);
  const original=await request("/api/transactions/charge-a",{token:ownerToken});
  assert.equal(original.data.transaction.amount,1000);
  assert.equal(Object.hasOwn(original.data.transaction,"correctedBy"),false);
  assert.equal((await request("/api/transactions/charge-a/corrections",{method:"POST",token:ownerToken,body:{reason:"Try duplicate correction"}})).status,409);

  const log=await request("/api/audit",{token:ownerToken});
  const event=log.data.auditLog.find(item=>item.action==="transaction.corrected"&&item.details.targetId==="charge-a");
  assert.ok(event);
  assert.equal(event.userId,JSON.parse(Buffer.from(ownerToken.split(".")[1],"base64url").toString()).sub);
  assert.equal(event.details.originalValue.amount,1000);
  assert.equal(event.details.newValue.length,2);
  assert.equal(event.details.reason,"Corrected amount to match approved levy record");
  assert.equal(event.details.correctionId,corrected.data.correctionId);
});