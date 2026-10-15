import { useState, useEffect, useRef } from "react";
import { WORKBOOK_LEDGER } from "./workbookLedger";

const fmt = n => Number(n).toLocaleString("en-KE", { minimumFractionDigits:2, maximumFractionDigits:2 });
const today = () => new Date().toISOString().slice(0,10);
const uid = () => `id_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
const MONTHLY_SECURITY = 3750, MONTHLY_OTHERS = 250, MONTHLY_TOTAL = 4000;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Levy rate history from the real spreadsheet records
const RATE_HISTORY = [
  { period:"2021",                 total:3500, security:3250, others:250 },
  { period:"Mid-2022 – mid-2024",  total:4000, security:3625, others:375 },
  { period:"Current (mid-2024 on)",total:4000, security:3750, others:250 },
];
const LEVY_HISTORY_NOTE = "Note: Levy was KES 3,500/month in 2021, increased to KES 4,000 in mid-2022";

// Security provider + M-Pesa paybill — values from the SProviders worksheet
const PROVIDER_KEY = "lc-provider6";
const PROVIDER_PAYMENTS_KEY = "lc-provider-payments6";
const PAYBILL = "8002331";
const SEED_PROVIDER = {
  name:"Olosho Security",
  contactPerson:"Masinde",
  mobile:"0768110169",
  hotline:"0786776634",
  paybill:"8002331",
  monthlyCharge:30000,
  notes:"",
};

// Only create a WhatsApp link when the source contains a valid Kenyan mobile number.
function normaliseKenyanPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  const national = digits.startsWith("254") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : "";
  return /^[17]\d{8}$/.test(national) ? `254${national}` : null;
}
const waLink = (phone, message) => {
  const number = normaliseKenyanPhone(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
};

// ── Reminder copy ───────────────────────────────────────────────
const REMINDER_TYPES = {
  levy:    { label:"25th reminder",      subject:"Monthly levy due",   audience:"ALL residents" },
  overdue: { label:"End-of-month reminder", subject:"Payment overdue", audience:"Residents with a balance > 0" },
};
const levyMessage = (name, month) =>
  `Dear ${name}, this is a reminder that your monthly security levy of KES ${fmt(MONTHLY_TOTAL)} for ${month} is due by the 25th. Paybill: ${PAYBILL}. Thank you, Lemayian Court.`;
const overdueMessage = (name, balance) =>
  `Dear ${name}, your security levy account shows KES ${fmt(balance)} outstanding. Please settle by end of month. Paybill: ${PAYBILL}. Lemayian Court.`;
const reminderMessage = (type, name, balance, month) =>
  type === "levy" ? levyMessage(name, month) : overdueMessage(name, balance);

const KEYS = { r:"lc-r6", t:"lc-t6", p:"lc-p6", c:"lc-c6", rem:"lc-rem6", tour:"lc-tour6" };
const LEGACY_KEYS = {
  r:["lc-r5","lc-r4","lc-r3"], t:["lc-t5","lc-t4","lc-t3"],
  p:["lc-p5","lc-p4","lc-p3"], c:["lc-c5","lc-c4","lc-c3"],
  rem:["lc-rem5","lc-rem4","lc-rem3"], tour:["lc-tour5","lc-tour4","lc-tour3"],
};
const MIGRATION_BACKUP_KEY = "lc-migration-backup-6";
const AUTH_KEY = "lc-auth-token";
const REFRESH_KEY = "lc-refresh-token";
const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

async function apiRequest(path, options={}, token) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers:{"Content-Type":"application/json",...(token ? {Authorization:`Bearer ${token}`} : {}),...(options.headers || {})},
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ── LOCAL STORAGE (works on your computer) ─────────────────────
function sg(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function ss(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function migrateLegacyStorage(storage) {
  const pending = {};
  for (const [name, currentKey] of Object.entries(KEYS)) {
    if (storage.getItem(currentKey) !== null) continue;
    for (const legacyKey of LEGACY_KEYS[name] || []) {
      const raw = storage.getItem(legacyKey);
      if (raw === null) continue;
      let value;
      try { value = JSON.parse(raw); }
      catch { throw new Error(`Legacy data at ${legacyKey} is not valid JSON`); }
      if (name !== "tour" && !Array.isArray(value)) throw new Error(`Legacy data at ${legacyKey} is not a valid array`);
      pending[currentKey] = raw;
      break;
    }
  }
  const entries = Object.entries(pending);
  if (!entries.length) return 0;

  const backup = JSON.stringify({version:6, createdAt:new Date().toISOString(), values:pending});
  storage.setItem(MIGRATION_BACKUP_KEY, backup);
  const verifiedBackup = JSON.parse(storage.getItem(MIGRATION_BACKUP_KEY) || "null");
  if (!verifiedBackup || JSON.stringify(verifiedBackup.values) !== JSON.stringify(pending)) {
    throw new Error("Could not verify the legacy-data backup; migration was stopped");
  }
  for (const [key, raw] of entries) {
    storage.setItem(key, raw);
    if (storage.getItem(key) !== raw) throw new Error(`Could not verify migrated data for ${key}; backup is at ${MIGRATION_BACKUP_KEY}`);
  }
  return entries.length;
}

const SEED_RESIDENTS = [
  {id:"r1",name:"Hon. Ndetei",unit:"A1",notes:""},
  {id:"r2",name:"Esther Gicimu",unit:"A2",notes:""},
  {id:"r3",name:"Njoroge",unit:"A3",notes:""},
  {id:"r4",name:"Magomere",unit:"A4",notes:""},
  {id:"r5",name:"Karanja",unit:"A5",notes:"Chronic arrears since 2021 — escalate reminders"},
  {id:"r6",name:"Muriuki",unit:"A6",notes:"Pays in bulk — often in credit"},
  {id:"r7",name:"Mbindu",unit:"A7",notes:"Pays in bulk — often in credit"},
  {id:"r8",name:"Mwanthi",unit:"A8",notes:""},
];

// ── Ledger import ──────────────────────────────────────────────
// Converts the workbook's imported rows (src/workbookLedger.js) into app transactions.
// Every row keeps its source reference so any figure can be traced back to its worksheet.
//
// Each annual worksheet opens with a b/fwd row. Concatenating the sheets verbatim would
// double-count those carried-forward positions, so only the EARLIEST b/fwd row per resident
// becomes the running opening balance; every later b/fwd row is kept in the history as a
// `restated` entry that does not move the balance.
//
// The workbook's own annual b/fwd figures are not always equal to the previous sheet's
// computed closing (e.g. r1: 2024 closes 4,250 but 2025 opens -2,750; r2: 2022 closes
// 10,500 but 2023 opens 0). Those are inconsistencies in the SOURCE workbook. They are
// preserved exactly as recorded and surfaced by reconcile() rather than silently adjusted.
//
// A positive b/fwd amount means the resident owed money; a negative amount is credit.
// Charge rows split into Security + Others; payment rows are credits.
function buildSeedTxns() {
  let n = 1;
  const next = () => `t${n++}`;
  const seen = new Set();
  const T = [];
  for (const row of WORKBOOK_LEDGER) {
    if (!row.d) continue;
    if (row.k === "b/fwd") {
      const first = !seen.has(row.r);
      seen.add(row.r);
      T.push({id:next(), residentId:row.r, date:row.d,
              type: first ? "openingBalance" : "restated",
              amount:row.s, security:0, others:0,
              note: first ? "Opening balance b/fwd" : "Balance b/fwd (year restated)",
              source:row.src});
      continue;
    }
    if (row.k === "payment") {
      T.push({id:next(), residentId:row.r, date:row.d, type:"payment",
              amount:row.c, security:0, others:0, note:"Payment", source:row.src});
      continue;
    }
    // charge — keep the historical Security/Others split exactly as recorded
    T.push({id:next(), residentId:row.r, date:row.d, type:"charge",
          amount:row.s + row.o, security:row.s, others:row.o,
          note:"Monthly levy", source:row.src, sourceKind:"charge"});
        if (row.c > 0) {
          T.push({id:next(), residentId:row.r, date:row.d, type:"payment",
            amount:row.c, security:0, others:0, note:"Payment credit recorded on charge row",
            source:row.src, sourceKind:"credit"});
        }
  }
  return normaliseLedgerDates(T);
}

// Some rows on the 2026 sheet carry a mistyped year (e.g. Mbindu 2026!R14 is dated 2025-04-25
// and 2026!R17 is dated 2025-07-25). The owning SHEET is authoritative, so any row whose date
// falls outside its sheet's year is rewritten to the sheet's year, keeping month and day.
// The original value is preserved on `sourceDate` so nothing is hidden.
function normaliseLedgerDates(T) {
  const yearOfSource = src => (src.match(/^(\d{4})!/) || [])[1];
  return T.map(t => {
    const sheetYear = yearOfSource(t.source);
    if (!sheetYear || !t.date) return t;
    if (t.date.startsWith(sheetYear)) return t;
    const md = t.date.slice(4);
    return {...t, sourceDate:t.date, date:`${sheetYear}${md}`};
  });
}

// Year-on-year b/fwd breaks found in the source workbook. Recorded as evidence, not corrected.
// Each entry compares a sheet's own opening figure with the previous sheet's closing figure.
function workbookYearBreaks() {
  const ids = ["r1","r2","r3","r4","r5","r6","r7","r8"];
  const years = ["2021","2022","2023","2024","2025","2026"];
  const breaks = [];
  ids.forEach(rid => {
    let prevClosing = null;
    years.forEach(y => {
      const rows = WORKBOOK_LEDGER.filter(e => e.y === y && e.r === rid);
      const bf = rows.find(e => e.k === "b/fwd");
      let net = 0;
      rows.filter(e => e.k !== "b/fwd").forEach(e => {
        net += (e.s || 0) + (e.o || 0) - (e.c || 0);
      });
      const opening = bf ? bf.s : 0;
      const closing = opening + net;
      if (prevClosing !== null && opening !== prevClosing) {
        breaks.push({residentId:rid, from:years[years.indexOf(y)-1], to:y,
                     previousClosing:prevClosing, thisOpening:opening,
                     difference:opening - prevClosing});
      }
      prevClosing = closing;
    });
  });
  return breaks;
}

// Reconciliation targets taken from the workbook's own closing rows (2026 sheet, row 32).
// Used by the reconciliation report to prove the import matches the source.
const WORKBOOK_CLOSING = {
  r1:0, r2:0, r3:0, r4:4000, r5:33000, r6:-8000, r7:-12000, r8:0,
};

// Opening (b/fwd) positions recorded on the 2026 worksheet, row 9.
const WORKBOOK_OPENING_2026 = {
  r1:4000, r2:0, r3:8000, r4:-4000, r5:32000, r6:0, r7:0, r8:0,
};

// Opening balance targets supplied in the implementation brief; source values remain authoritative.
const REQUESTED_OPENING_2026 = {
  r1:4000, r2:0, r3:8000, r4:0, r5:32000, r6:0, r7:0, r8:0,
};

// GateHouse records from the GateHouse worksheet (totals row 26).
const WORKBOOK_GATEHOUSE = {
  estimatedTotal:365080,
  actualTotal:456479,
  overspend:91399,
};
const WORKBOOK_GATEHOUSE_ITEMS = [
  {row:4,date:"2021",description:"Quoted by contractor",estimated:318080,actual:303000,remarks:"Advanced in 5 instalments"},
  {row:5,date:"2021",description:"City Council cost",estimated:0,actual:30000},
  {row:6,date:"2021",description:"Water works",estimated:0,actual:27320,remarks:"Laying pipes/meter from House 1"},
  {row:7,date:"2021",description:"Metal Gate rebuild",estimated:35000,actual:15000,remarks:"Remodelled old one"},
  {row:8,date:"2021",description:"External Road works",estimated:0,actual:19400,remarks:"Kerbs outside"},
  {row:9,date:"2021",description:"Tile repair after leaks",estimated:0,actual:4180,remarks:"Pipe leakage"},
  {row:10,date:"2021",description:"W/basin + m/hole cover",estimated:0,actual:1650,remarks:"Abandoned by contractor"},
  {row:11,date:"2021",description:"Painting",estimated:0,actual:16920,remarks:"Abandoned by contractor"},
  {row:12,date:"2021",description:"Window panes",estimated:0,actual:2500,remarks:"Abandoned by contractor"},
  {row:13,date:"2021",description:"Lighting",estimated:0,actual:4500,remarks:"Security light"},
  {row:14,date:"2021",description:"Wiring & solar",estimated:12000,actual:0,remarks:"Outstanding"},
  {row:15,date:"2024-01-24",description:"Facilitation",estimated:null,actual:2000},
  {row:16,date:"2024-01-01",description:"Chair",estimated:null,actual:875},
  {row:17,date:"2024-01-01",description:"Phone",estimated:null,actual:2250},
  {row:18,date:"2024-02-01",description:"Gate repair",estimated:null,actual:1000},
  {row:19,date:"2024-02-01",description:"Murram",estimated:0,actual:10500},
  {row:20,date:"2024-03-04",description:"Water Closet",estimated:null,actual:5770},
  {row:21,date:"2025-01-02",description:"Water pipe repair",estimated:null,actual:6500},
  {row:22,date:"2025-12-25",description:"Christmas Shopping",estimated:null,actual:3114},
].map(item => ({...item,source:`GateHouse!row ${item.row}`}));
const WORKBOOK_PAYMENT_REFERENCES = [
  {row:2,date:"2023-05-04",amount:29000,reference:"RE43PH510X",detail:"For month 2023-04-01",kind:"payment reference",status:"Unmatched; excluded from resident ledger"},
  {row:3,date:"2023-05-30",amount:29000,reference:"REU5SBKNLR",detail:"For month 2023-05-23",kind:"payment reference",status:"Unmatched; excluded from resident ledger"},
  {row:4,date:"March",amount:700,reference:"",detail:"Grass planting",kind:"expense note",status:"Not a resident payment"},
  {row:5,date:"May",amount:700,reference:"",detail:"Weeding",kind:"expense note",status:"Not a resident payment"},
].map(item => ({...item,source:`Payment Details!row ${item.row}`}));

// Reconciliation report. For each resident: opening position, total charges, total payments,
// the calculated closing balance, the workbook's own closing figure, and the difference.
// A resident's figures are scoped to the CURRENT ledger year (2026) so they match the
// worksheet being reconciled; `restated` rows reset the chain rather than adding to it.
function reconcile(residents, transactions) {
  return residents.map(r => {
    const rows = runningBalance(transactions.filter(t => t.residentId === r.id));
    // The last restated row is the opening position of the period being reported.
    const lastRestated = [...rows].reverse().find(t => t.type === "restated" || t.type === "openingBalance");
    const fromDate = lastRestated ? lastRestated.date : null;
    const opening = lastRestated ? lastRestated.amount : 0;
    const scoped = rows.filter(t => !fromDate || t.date >= fromDate);
    const charges  = scoped.filter(t => t.type === "charge").reduce((s,t) => s + t.amount, 0);
    const payments = scoped.filter(t => t.type === "payment").reduce((s,t) => s + t.amount, 0);
    const adjustments = scoped.filter(t => t.type === "reversal").reduce((s,t) => s + (Number(t.balanceEffect) || 0), 0);
    const calculated = rows.length ? rows[rows.length-1].run : 0;
    const expected = WORKBOOK_CLOSING[r.id];
    return {
      ...r, opening, charges, payments, adjustments,
      calculated,
      expected,
      difference: expected === undefined ? null : calculated - expected,
      status: expected === undefined ? "no-target"
           : calculated === expected ? "reconciled" : "mismatch",
      firstDate: rows.length ? rows[0].date : null,
      lastDate:  rows.length ? rows[rows.length-1].date : null,
      count: rows.length,
    };
  });
}


// GateHouse records from the GateHouse worksheet.
// Workbook evidence: estimated total KES 365,080 · actual total KES 456,479 ·
// overspend KES 91,399 (GateHouse!D26/E26/F26). The 2026 sheet shows 8 houses × KES 50,000
// = KES 400,000 for the 1st Estimate and 8 × KES 10,000 = KES 80,000 for Additional Works.
const SEED_PROJECTS = [
  {id:"p1",name:"GateHouse – 1st Estimate",target:400000,received:400000,status:"Fully funded by 2024",notes:"Main gatehouse construction — fully funded by 2024"},
  {id:"p2",name:"GateHouse – Additional Works",target:56479,received:0,status:"Review source totals",notes:"The resident summaries record KES 80,000 received; GateHouse actual expenditure exceeds estimate by KES 91,399."},
  {id:"p3",name:"GateHouse – Outstanding Items",target:12000,received:0,status:"Outstanding",notes:"Wiring & solar outstanding since 2021"},
];

const SEED_CONTRIBS = [
  {id:"c1",projectId:"p1",residentId:"r1",amount:50000,note:"Workbook summary",source:"2026!D38"},
  {id:"c2",projectId:"p1",residentId:"r2",amount:50000,note:"Workbook summary",source:"2026!K38"},
  {id:"c3",projectId:"p1",residentId:"r3",amount:50000,note:"Workbook summary",source:"2026!R38"},
  {id:"c4",projectId:"p1",residentId:"r4",amount:50000,note:"Workbook summary",source:"2026!Y38"},
  {id:"c5",projectId:"p1",residentId:"r5",amount:50000,note:"Workbook summary",source:"2026!AF38"},
  {id:"c6",projectId:"p1",residentId:"r6",amount:50000,note:"Workbook summary",source:"2026!AM38"},
  {id:"c7",projectId:"p1",residentId:"r7",amount:50000,note:"Workbook summary",source:"2026!AT38"},
  {id:"c8",projectId:"p1",residentId:"r8",amount:50000,note:"Workbook summary",source:"2026!BA38"},
  {id:"c9",projectId:"p2",residentId:"r1",amount:10000,note:"Workbook summary",source:"2026!D39"},
  {id:"c10",projectId:"p2",residentId:"r2",amount:10000,note:"Workbook summary",source:"2026!K39"},
  {id:"c11",projectId:"p2",residentId:"r3",amount:10000,note:"Workbook summary",source:"2026!R39"},
  {id:"c12",projectId:"p2",residentId:"r4",amount:10000,note:"Workbook summary",source:"2026!Y39"},
  {id:"c13",projectId:"p2",residentId:"r5",amount:10000,note:"Workbook summary",source:"2026!AF39"},
  {id:"c14",projectId:"p2",residentId:"r6",amount:10000,note:"Workbook summary",source:"2026!AM39"},
  {id:"c15",projectId:"p2",residentId:"r7",amount:10000,note:"Workbook summary",source:"2026!AT39"},
  {id:"c16",projectId:"p2",residentId:"r8",amount:10000,note:"Workbook summary",source:"2026!BA39"},
];
const SEED_REMINDERS = [];

// A transaction affects the running balance unless it is a restated year-opening row.
const affectsBalance = t => t.type !== "restated";

// Running balance for a resident.
// `restated` rows RESET the balance rather than adding to it: every annual worksheet is
// authoritative for its own period, so its b/fwd figure becomes the new starting point.
// This reproduces the workbook exactly, including its internal year-on-year breaks.
function runningBalance(transactions) {
  let run = 0;
  return [...transactions]
    .sort((a,b) => a.date.localeCompare(b.date))
    .map(t => {
      if (t.type === "restated") run = t.amount;
      else if (t.type === "reversal") run += Number(t.balanceEffect) || 0;
      else if (t.type === "payment") run -= t.amount;
      else run += t.amount;
      return {...t, run};
    });
}

function calcBal(residentId, transactions) {
  const rows = runningBalance(transactions.filter(t => t.residentId === residentId));
  return rows.length ? rows[rows.length - 1].run : 0;
}

function hasDuplicateCharge(transactions, residentId, date) {
  const month = date.slice(0, 7);
  return transactions.some(t => t.residentId === residentId && t.type === "charge" && t.date.startsWith(month));
}

function removeResidentData(residentId, residents, transactions, contribs) {
  return {
    residents: residents.filter(r => r.id !== residentId),
    transactions: transactions.filter(t => t.residentId !== residentId),
    contribs: contribs.filter(c => c.residentId !== residentId),
  };
}

function isValidBackup(data) {
  return Boolean(data && Array.isArray(data.residents) && Array.isArray(data.transactions));
}

function exportCSV(filename, headers, rows) {
  const csv = [headers, ...rows].map(row => row.map(value => JSON.stringify(value ?? "")).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], {type:"text/csv;charset=utf-8"}));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function printStatement(resident, rows, balance) {
  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) return;
  const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const charged = rows.filter(t => t.type === "charge").reduce((s,t) => s + t.amount, 0);
  const paid = rows.filter(t => t.type === "payment").reduce((s,t) => s + t.amount, 0);
  const adjustments = rows.filter(t => t.type === "reversal").reduce((s,t) => s + (Number(t.balanceEffect) || 0), 0);
  win.document.write(`<!doctype html><html><head><title>Statement - ${escapeHtml(resident.name)}</title><style>
    *{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#102419;padding:32px}header{display:flex;justify-content:space-between;border-bottom:3px solid #1a6b3a;padding-bottom:16px;margin-bottom:22px}h1{font-size:20px;color:#1a6b3a;margin:0}h2{font-size:16px;margin:0 0 4px}.muted{color:#66786c}.balance{border:1px solid #c8d8cb;border-radius:8px;padding:14px 18px;margin-bottom:20px}.amount{font-size:22px;font-weight:800;color:${balance > 0 ? "#c0392b" : balance < 0 ? "#2471a3" : "#1a6b3a"}}table{width:100%;border-collapse:collapse}th{background:#1a6b3a;color:#fff;text-align:left;padding:8px}td{padding:7px 8px;border-bottom:1px solid #e4ede6}th:nth-child(n+3),td:nth-child(n+3){text-align:right}tfoot{font-weight:800;background:#f4f8f5}footer{margin-top:24px;border-top:1px solid #d4e4d7;padding-top:10px;color:#66786c;font-size:10px;display:flex;justify-content:space-between}@media print{body{padding:16px}}
  </style></head><body><header><div><h1>Lemayian Court</h1><div class="muted">Estate Manager · Account statement</div></div><div><h2>${escapeHtml(resident.name)}</h2><div class="muted">Unit ${escapeHtml(resident.unit)}</div></div></header><div class="balance"><div class="muted">Balance as of ${new Date().toLocaleDateString("en-KE",{day:"numeric",month:"long",year:"numeric"})}</div><div class="amount">${balance > 0 ? `KES ${fmt(balance)} owed` : balance < 0 ? `KES ${fmt(Math.abs(balance))} credit` : "Fully settled"}</div></div><div class="muted" style="margin-bottom:12px">Statement Period: Full history · ${rows.length} transaction${rows.length!==1?"s":""}</div><table><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th>Charge</th><th>Payment</th><th>Adjustment</th><th>Balance</th></tr></thead><tbody>${rows.map(t => `<tr><td>${escapeHtml(t.date)}</td><td>${escapeHtml(t.note || t.type)}</td><td>${escapeHtml(t.mpesa || t.id || "-")}</td><td>${t.type === "charge" ? `KES ${fmt(t.amount)}` : ""}</td><td>${t.type === "payment" ? `KES ${fmt(t.amount)}` : ""}</td><td>${t.type === "reversal" ? `KES ${fmt(t.balanceEffect)}` : ""}</td><td>KES ${fmt(Math.abs(t.run))}${t.run < 0 ? " Cr" : ""}</td></tr>`).join("")}</tbody><tfoot><tr><td colspan="3">Totals</td><td>KES ${fmt(charged)}</td><td>KES ${fmt(paid)}</td><td>KES ${fmt(adjustments)}</td><td>${balance > 0 ? `KES ${fmt(balance)} owed` : balance < 0 ? `KES ${fmt(Math.abs(balance))} credit` : "Settled"}</td></tr></tfoot></table><footer><span>Generated ${new Date().toLocaleString("en-KE")}</span><span>Lemayian Court · Nairobi, Kenya</span></footer><script>window.onload=function(){window.print();}</script></body></html>`);
  win.document.close();
}

// ── Toast ──────────────────────────────────────────────────────
function Toasts({ toasts, remove }) {
  return (
    <div style={{position:"fixed",top:16,right:16,zIndex:9999,display:"flex",flexDirection:"column",gap:8,pointerEvents:"none"}}>
      {toasts.map(t => (
        <div key={t.id} onClick={() => remove(t.id)} style={{
          background: t.type==="error" ? "#c0392b" : t.type==="warn" ? "#e67e22" : "#1a6b3a",
          color:"#fff", padding:"0.65rem 1rem", borderRadius:10, fontSize:"0.84rem", fontWeight:700,
          boxShadow:"0 4px 20px rgba(0,0,0,0.22)", pointerEvents:"all", cursor:"pointer",
          display:"flex", alignItems:"center", gap:8, maxWidth:280, animation:"slideIn 0.2s ease"
        }}>
          <span>{t.type==="error" ? "✗" : t.type==="warn" ? "⚠" : "✓"}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, set] = useState([]);
  const toast = (msg, type="ok") => {
    const id = uid();
    set(p => [...p, {id, msg, type}]);
    setTimeout(() => set(p => p.filter(x => x.id !== id)), 3000);
  };
  return { toasts, remove: id => set(p => p.filter(x => x.id !== id)), toast };
}

// ── Icons ──────────────────────────────────────────────────────
function Ico({ n, sz=18 }) {
  if (n === "people") return (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
  const p = {
    home:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|M9 22V12h6v10",
    card:"M2 5h20a2 2 0 0 1 0 4H2z|M2 9h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z",
    layers:"M12 2L2 7l10 5 10-5-10-5|M2 17l10 5 10-5|M2 12l10 5 10-5",
    file:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8",
    plus:"M12 5v14|M5 12h14", trash:"M3 6h18|M8 6V4h8v2|M19 6l-1 14H6L5 6|M10 11v6|M14 11v6",
    back:"M19 12H5|M12 19l-7-7 7-7", check:"M20 6L9 17l-5-5", x:"M18 6L6 18|M6 6l12 12",
    edit:"M11 4H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7|M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z",
    warn:"M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z|M12 9v4|M12 17h.01",
    bar:"M18 20V10|M12 20V4|M6 20v-6",
    shield:"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z|M9 12l2 2 4-4",
    user:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  };
  return (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {(p[n]||"").split("|").map((d,i) => <path key={i} d={d}/>)}
    </svg>
  );
}

// ── UI Atoms ───────────────────────────────────────────────────
const FL = { display:"flex", alignItems:"center" };

function Modal({ title, onClose, children, w=480 }) {
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(5,15,8,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:"1rem",backdropFilter:"blur(3px)"}}>
      <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:w,maxHeight:"92vh",overflow:"auto",boxShadow:"0 24px 60px rgba(0,0,0,0.25)"}}>
        <div style={{...FL,justifyContent:"space-between",padding:"1rem 1.35rem",borderBottom:"1px solid #e4ede6",position:"sticky",top:0,background:"#fff"}}>
          <span style={{fontWeight:800,color:"#0f2417",fontSize:"0.95rem"}}>{title}</span>
          <button onClick={onClose} style={{background:"#f0f5f1",border:"none",borderRadius:7,padding:"5px 7px",cursor:"pointer",display:"flex"}}><Ico n="x" sz={15}/></button>
        </div>
        <div style={{padding:"1.35rem"}}>{children}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ message, onCancel, onConfirm }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(5,15,8,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1200,padding:"1rem"}}>
      <div role="dialog" aria-modal="true" style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:430,padding:"1.35rem",boxShadow:"0 24px 60px rgba(0,0,0,0.25)"}}>
        <h2 style={{margin:"0 0 0.65rem",fontSize:"1rem",color:"#0f2417"}}>Please confirm</h2>
        <p style={{margin:"0 0 1.2rem",color:"#4a6352",fontSize:"0.86rem",lineHeight:1.55,whiteSpace:"pre-line"}}>{message}</p>
        <div style={{...FL,justifyContent:"flex-end",gap:"0.65rem"}}>
          <BTN v="sec" onClick={onCancel}>Cancel</BTN>
          <BTN v="dan" onClick={onConfirm}>Confirm</BTN>
        </div>
      </div>
    </div>
  );
}

function useConfirm() {
  const [request, setRequest] = useState(null);
  const confirm = message => new Promise(resolve => setRequest({message, resolve}));
  const resolve = answer => {
    request?.resolve(answer);
    setRequest(null);
  };
  const dialog = request && <ConfirmDialog message={request.message} onCancel={() => resolve(false)} onConfirm={() => resolve(true)}/>;
  return {confirm, dialog};
}

const LBL = ({c}) => <label style={{display:"block",fontSize:"0.72rem",fontWeight:700,color:"#4a6352",marginBottom:"0.3rem",textTransform:"uppercase",letterSpacing:"0.055em"}}>{c}</label>;
const FLD = ({label, hint, children}) => <div style={{marginBottom:"0.95rem"}}>{label && <LBL c={label}/>}{children}{hint && <div style={{fontSize:"0.72rem",color:"#8a9e91",marginTop:"0.22rem"}}>{hint}</div>}</div>;
const INP = ({style:s, ...p}) => <input {...p} style={{width:"100%",padding:"0.57rem 0.78rem",border:"1.5px solid #c8d8cb",borderRadius:8,fontSize:"0.875rem",color:"#0f2417",outline:"none",boxSizing:"border-box",background:"#f9fbfa",fontFamily:"inherit",...s}}/>;
const TXA = ({style:s, ...p}) => <textarea {...p} style={{width:"100%",padding:"0.57rem 0.78rem",border:"1.5px solid #c8d8cb",borderRadius:8,fontSize:"0.875rem",color:"#0f2417",outline:"none",boxSizing:"border-box",background:"#f9fbfa",fontFamily:"inherit",resize:"vertical",...s}}/>;
const SEL = ({children, ...p}) => <select {...p} style={{width:"100%",padding:"0.57rem 0.78rem",border:"1.5px solid #c8d8cb",borderRadius:8,fontSize:"0.875rem",color:"#0f2417",outline:"none",background:"#f9fbfa",fontFamily:"inherit"}}>{children}</select>;

function BTN({ v="pri", sz="md", children, style:s, ...p }) {
  const vs = {
    pri:{background:"#1a6b3a",color:"#fff",border:"none"},
    sec:{background:"#eaf1ec",color:"#1a6b3a",border:"1.5px solid #b6d4be"},
    dan:{background:"#fff1f0",color:"#c0392b",border:"1.5px solid #f5c5c2"},
    gho:{background:"transparent",color:"#4a6352",border:"1.5px solid #d4e4d7"},
  };
  const szs = {
    md:{padding:"0.57rem 1.1rem",fontSize:"0.84rem"},
    sm:{padding:"0.36rem 0.72rem",fontSize:"0.77rem"},
    lg:{padding:"0.72rem 1.4rem",fontSize:"0.92rem"},
  };
  return <button {...p} style={{...szs[sz],...vs[v],borderRadius:8,fontWeight:700,cursor:p.disabled?"not-allowed":"pointer",opacity:p.disabled?0.5:1,display:"inline-flex",alignItems:"center",gap:"0.36rem",fontFamily:"inherit",...s}}>{children}</button>;
}

const BDG = ({c="#1a6b3a", bg="#eaf5ed", children}) => <span style={{background:bg,color:c,borderRadius:99,padding:"0.16rem 0.55rem",fontSize:"0.71rem",fontWeight:700}}>{children}</span>;

// ── Tour ───────────────────────────────────────────────────────
const TOUR = [
  {page:"dashboard", emoji:"🏡", title:"Your Command Centre", body:"See total collections, outstanding balances, provider coverage, and arrears — all at a glance."},
  {page:"residents", emoji:"👥", title:"Resident Statements", body:"Each resident has a live ledger showing every charge, payment, and running balance — exactly like your PDF but editable in real time."},
  {page:"provider",  emoji:"🛡️", title:"Security Provider", body:"Keep Olosho Security's contacts, paybill, and monthly charge in one place — editable and saved to this device."},
  {page:"reminders", emoji:"🔔", title:"Scheduled Reminders", body:"See this month's schedule, send bulk WhatsApp or SMS reminders, and keep an accountability trail for arrears follow-up."},
  {page:"reports",   emoji:"📊", title:"Reports & Analytics", body:"Monthly bar charts, collection rates, levy history, and a full resident summary. Your year-end report is always ready."},
  {page:"residentview", emoji:"👤", title:"Resident View", body:"Hand the screen to a resident: they pick their unit, see only their own statement, and pay by M-Pesa — read-only."},
  {page:"settings",  emoji:"⚙️", title:"Backup & Restore", body:"Download or restore complete estate records and reset to the presentation-ready demo state."},
];

function Tour({ step, onNext, onSkip }) {
  const s = TOUR[step], last = step === TOUR.length - 1;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(5,15,8,0.72)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem",backdropFilter:"blur(4px)"}}>
      <div style={{background:"#fff",borderRadius:18,maxWidth:420,width:"100%",padding:"2rem 2rem 1.6rem",boxShadow:"0 28px 80px rgba(0,0,0,0.3)",textAlign:"center"}}>
        <div style={{fontSize:"2.8rem",marginBottom:"0.75rem"}}>{s.emoji}</div>
        <div style={{fontSize:"0.7rem",fontWeight:800,color:"#6aaa7a",textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:"0.45rem"}}>Step {step+1} of {TOUR.length}</div>
        <h2 style={{margin:"0 0 0.7rem",fontSize:"1.15rem",fontWeight:900,color:"#0f2417",lineHeight:1.25}}>{s.title}</h2>
        <p style={{margin:"0 0 1.5rem",color:"#4a6352",fontSize:"0.875rem",lineHeight:1.65}}>{s.body}</p>
        <div style={{display:"flex",gap:"0.7rem",justifyContent:"center"}}>
          <BTN v="gho" sz="sm" onClick={onSkip}>Skip Tour</BTN>
          <BTN sz="md" onClick={onNext}>{last ? "Let's Go! 🚀" : "Next →"}</BTN>
        </div>
        <div style={{display:"flex",gap:5,justifyContent:"center",marginTop:"1.2rem"}}>
          {TOUR.map((_,i) => <div key={i} style={{width:i===step?22:7,height:7,borderRadius:99,background:i===step?"#1a6b3a":"#c8d8cb",transition:"width 0.22s"}}/>)}
        </div>
      </div>
    </div>
  );
}

// ── Receipt ────────────────────────────────────────────────────
function Receipt({ txn, res, onClose }) {
  const isReversal = txn.type === "reversal";
  const isDebit = txn.type === "charge";
  const receiptAmount = isReversal ? Math.abs(Number(txn.balanceEffect) || 0) : txn.amount;
  return (
    <Modal title={isReversal?"Correction Entry":txn.type==="payment"?"Payment Receipt":"Transaction Record"} onClose={onClose} w={360}>
      <div style={{textAlign:"center",marginBottom:"1.1rem"}}>
        <div style={{width:54,height:54,background:isDebit?"#fff1f0":"#eaf5ed",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 0.7rem",fontSize:"1.5rem"}}>{isDebit?"📋":"✅"}</div>
        <div style={{fontSize:"0.75rem",color:"#8a9e91",marginBottom:"0.2rem"}}>{isReversal?"Reversal · no funds received":txn.type==="payment"?"Payment recorded manually":"Charge Posted"}</div>
        <div style={{fontSize:"1.9rem",fontWeight:900,color:isReversal?"#2471a3":isDebit?"#c0392b":"#1a6b3a",fontVariantNumeric:"tabular-nums"}}>KES {fmt(receiptAmount)}</div>
      </div>
      <div style={{background:"#f4f8f5",borderRadius:10,overflow:"hidden"}}>
            {[ ["Resident",res?.name], ["Unit",res?.unit], ["Date",txn.date], ["Receipt number",txn.type==="payment"?`RCPT-${txn.id}`:null], ["Transaction ID",txn.id], ["M-Pesa ref",txn.mpesa], ["Reverses",txn.reversalOf], ["Correction reason",txn.reason], ["Description",txn.note], ["Security",txn.security?`KES ${fmt(txn.security)}`:null], ["Others",txn.others?`KES ${fmt(txn.others)}`:null] ].filter(([,value])=>value).map(([k,v],i,a) => (
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"0.52rem 0.9rem",borderBottom:i<a.length-1?"1px solid #e4ede6":"none"}}>
            <span style={{color:"#6b7f72",fontSize:"0.79rem"}}>{k}</span>
            <span style={{fontWeight:700,fontSize:"0.79rem",color:"#0f2417",maxWidth:200,textAlign:"right"}}>{v}</span>
          </div>
        ))}
      </div>
      {txn.type==="payment"&&<div style={{fontSize:"0.72rem",color:"#80530e",marginTop:"0.75rem"}}>Manually recorded; payment was not independently verified.</div>}
      <BTN onClick={onClose} style={{width:"100%",justifyContent:"center",marginTop:"1rem"}}>Close</BTN>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
function Dashboard({ residents, transactions, setPage, provider, canManage=true }) {
  const bals = residents.map(r => ({...r, bal: calcBal(r.id, transactions)}));
    const owed = bals.filter(r => r.bal > 0).reduce((s,r) => s + r.bal, 0);
  const cred = bals.filter(r => r.bal < 0).reduce((s,r) => s+Math.abs(r.bal), 0);
  const paid = transactions.filter(t => t.type==="payment").reduce((s,t) => s+t.amount, 0);
  const levied = transactions.filter(t => t.type==="charge").reduce((s,t) => s+t.amount, 0);
  const rate = levied > 0 ? Math.round((paid/levied)*100) : 0;
  const overdue = bals.filter(r => r.bal > 0).sort((a,b) => b.bal-a.bal);
  // Coverage — levy collected this month vs the security provider's monthly cost
  const monthPre = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
  const collectedThisMonth = transactions.filter(t => t.type==="payment" && t.date.startsWith(monthPre)).reduce((s,t) => s+t.amount, 0);
  const providerCost = provider.monthlyCharge || 0;
  const coveragePct = providerCost > 0 ? Math.round((collectedThisMonth/providerCost)*100) : 0;
  const potentialLevy = residents.length * MONTHLY_TOTAL;
  const potentialCoveragePct = providerCost > 0 ? (potentialLevy/providerCost)*100 : 0;
  const now = new Date();
  const last6 = Array.from({length:6}, (_,i) => {
    const d = new Date(now); d.setMonth(d.getMonth()-5+i);
    const pre = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    return { lbl: MONTHS[d.getMonth()], p: transactions.filter(t => t.type==="payment" && t.date.startsWith(pre)).reduce((s,t) => s+t.amount, 0) };
  });
  const mx = Math.max(...last6.map(m => m.p), 1);
  const circ = 2 * Math.PI * 32;
  return (
    <div>
      <h2 style={{margin:"0 0 0.3rem",fontSize:"1.3rem",fontWeight:900,color:"#0f2417"}}>Dashboard</h2>
      <p style={{margin:"0 0 1.4rem",color:"#6b7f72",fontSize:"0.84rem"}}>Lemayian Court · {residents.length} residents · As of {new Date().toLocaleDateString("en-KE",{day:"numeric",month:"long",year:"numeric"})}</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:"0.85rem",marginBottom:"1.1rem"}}>
        {[{l:"Total Collected",v:paid,co:"#1a6b3a",bg:"#eaf5ed",em:"✓"},{l:"Outstanding",v:owed,co:"#c0392b",bg:"#fff1f0",em:"⚡",s:`${overdue.length} resident${overdue.length!==1?"s":""}`},{l:"In Credit",v:cred,co:"#2471a3",bg:"#eaf3fb",em:"↑"}].map(c => (
          <div key={c.l} style={{background:"#fff",borderRadius:12,padding:"1rem 1.15rem",border:"1px solid #e2ece4",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.45rem"}}>
              <span style={{fontSize:"0.71rem",fontWeight:800,color:"#6b7f72",textTransform:"uppercase",letterSpacing:"0.055em"}}>{c.l}</span>
              <span style={{background:c.bg,borderRadius:6,padding:"2px 7px",fontSize:"0.95rem"}}>{c.em}</span>
            </div>
            <div style={{fontSize:"1.4rem",fontWeight:900,color:c.co,fontVariantNumeric:"tabular-nums",lineHeight:1}}>KES {fmt(c.v)}</div>
            {c.s && <div style={{fontSize:"0.71rem",color:"#8a9e91",marginTop:"0.28rem"}}>{c.s}</div>}
          </div>
        ))}
        <div style={{background:"#fff",borderRadius:12,padding:"1rem 1.15rem",border:"1px solid #e2ece4"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.45rem"}}>
            <span style={{fontSize:"0.71rem",fontWeight:800,color:"#6b7f72",textTransform:"uppercase",letterSpacing:"0.055em"}}>Coverage</span>
            <span style={{background:coveragePct>=100?"#eaf5ed":"#fef4e8",borderRadius:6,padding:"2px 7px",fontSize:"0.95rem"}}>{coveragePct>=100?"✓":"⚡"}</span>
          </div>
          <div style={{fontSize:"1.4rem",fontWeight:900,color:coveragePct>=100?"#1a6b3a":"#e67e22",fontVariantNumeric:"tabular-nums",lineHeight:1}}>{coveragePct}%</div>
          <div style={{fontSize:"0.71rem",color:"#8a9e91",marginTop:"0.28rem",lineHeight:1.5}}>
            Potential levy: KES {fmt(potentialLevy)} ({potentialCoveragePct.toFixed(2)}% of provider cost) · Actual payments received this month: KES {fmt(collectedThisMonth)} · Cost: KES {fmt(providerCost)}
          </div>
        </div>
        <div style={{background:"#fff",borderRadius:12,padding:"1rem 1.15rem",border:"1px solid #e2ece4",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          <div style={{fontSize:"0.71rem",fontWeight:800,color:"#6b7f72",textTransform:"uppercase",letterSpacing:"0.055em",marginBottom:"0.6rem",alignSelf:"flex-start"}}>Collection Rate</div>
          <svg width={72} height={72} viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" stroke="#e8f0eb" strokeWidth="10"/>
            <circle cx="40" cy="40" r="32" fill="none" stroke={rate>=90?"#1a6b3a":rate>=70?"#e67e22":"#c0392b"} strokeWidth="10" strokeDasharray={`${(rate/100)*circ} ${circ}`} strokeLinecap="round" transform="rotate(-90 40 40)"/>
            <text x="40" y="44" textAnchor="middle" fontSize="15" fontWeight="800" fill="#0f2417">{rate}%</text>
          </svg>
        </div>
      </div>
      <div style={{background:"#0d1f13",borderRadius:12,padding:"1.05rem 1.2rem",marginBottom:"0.85rem",color:"#fff",display:"flex",justifyContent:"space-between",alignItems:"center",gap:"1rem",flexWrap:"wrap"}}>
        <div style={{...FL,gap:"0.7rem",minWidth:0}}>
          <div style={{width:38,height:38,borderRadius:10,background:"rgba(106,170,122,0.2)",display:"flex",alignItems:"center",justifyContent:"center",color:"#7dca8c",flexShrink:0}}><Ico n="shield" sz={19}/></div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:"0.66rem",color:"#6aaa7a",textTransform:"uppercase",fontWeight:800,letterSpacing:"0.07em",marginBottom:"0.15rem"}}>Security Provider</div>
            <div style={{fontWeight:900,fontSize:"1rem",lineHeight:1.2}}>{provider.name || "—"}</div>
            <div style={{fontSize:"0.75rem",color:"rgba(255,255,255,0.62)",marginTop:"0.15rem"}}>
              📱 {provider.mobile || "—"} · Paybill {provider.paybill || "—"} · <b style={{color:"#7dca8c"}}>KES {fmt(provider.monthlyCharge)}/month</b>
            </div>
          </div>
        </div>
        <BTN v="sec" sz="sm" onClick={() => setPage("provider")}>Manage Provider →</BTN>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:"0.85rem",marginBottom:"1.1rem"}}>
        <div style={{background:"#fff",borderRadius:12,padding:"1.1rem 1.2rem",border:"1px solid #e2ece4"}}>
          <div style={{fontWeight:800,color:"#0f2417",fontSize:"0.84rem",marginBottom:"0.9rem"}}>Payments — Last 6 Months</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:5,height:80}}>
            {last6.map((m,i) => (
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{width:"100%",background:m.p>0?"#1a6b3a":"#e8f0eb",borderRadius:"3px 3px 0 0",height:`${(m.p/mx)*100}%`,minHeight:m.p>0?4:0}}/>
                <span style={{fontSize:"0.61rem",color:"#8a9e91",fontWeight:700}}>{m.lbl}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",overflow:"hidden"}}>
          <div style={{padding:"0.7rem 1rem",borderBottom:"1px solid #e2ece4",fontWeight:800,color:"#0f2417",fontSize:"0.84rem"}}>Quick Stats</div>
          {[["Residents",residents.length,"#0f2417"],["In Arrears",overdue.length,"#c0392b"],["Settled",bals.filter(r=>r.bal<=0).length,"#1a6b3a"],["Monthly Levy",`KES ${fmt(MONTHLY_TOTAL)}`,"#0f2417"],["Provider Cost",`KES ${fmt(provider.monthlyCharge)}`,"#0f2417"]].map(([k,v,c]) => (
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"0.52rem 1rem",borderBottom:"1px solid #eef3ef",fontSize:"0.82rem"}}>
              <span style={{color:"#6b7f72"}}>{k}</span><span style={{fontWeight:800,color:c}}>{v}</span>
            </div>
          ))}
          {canManage && <div style={{padding:"0.75rem 1rem"}}><BTN v="sec" style={{width:"100%",justifyContent:"center",fontSize:"0.77rem"}} onClick={() => setPage("payments")}>📋 Post This Month's Levy</BTN></div>}
        </div>
      </div>
      {overdue.length > 0 && (
        <div style={{background:"#fff",border:"1px solid #f5c5c2",borderRadius:12,overflow:"hidden",marginBottom:"1.1rem"}}>
          <div style={{...FL,gap:6,padding:"0.75rem 1rem",background:"#fff8f7",borderBottom:"1px solid #f5c5c2"}}>
            <Ico n="warn" sz={15}/><span style={{fontWeight:800,color:"#c0392b",fontSize:"0.84rem"}}>Arrears — {overdue.length} Resident{overdue.length!==1?"s":""}</span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.81rem"}}>
            <thead><tr style={{background:"#fdf5f4"}}>{["Resident","Unit","Est. Months","Amount Owed"].map(h => <th key={h} style={{padding:"0.48rem 0.9rem",textAlign:h.includes("Amount")?"right":"left",color:"#c0392b",fontWeight:800,fontSize:"0.7rem",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
            <tbody>{overdue.map(r => (
              <tr key={r.id} style={{borderBottom:"1px solid #fdecea"}}>
                <td style={{padding:"0.52rem 0.9rem",fontWeight:700,color:"#0f2417"}}>{r.name}</td>
                <td style={{padding:"0.52rem 0.9rem",color:"#6b7f72"}}>{r.unit}</td>
                <td style={{padding:"0.52rem 0.9rem",color:"#8a9e91"}}>~{Math.round(r.bal/MONTHLY_TOTAL)} mo</td>
                <td style={{padding:"0.52rem 0.9rem",textAlign:"right",fontWeight:900,color:"#c0392b",fontVariantNumeric:"tabular-nums"}}>KES {fmt(r.bal)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",overflow:"hidden"}}>
        <div style={{padding:"0.75rem 1rem",borderBottom:"1px solid #e2ece4",fontWeight:800,color:"#0f2417",fontSize:"0.85rem"}}>All Resident Balances</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.81rem"}}>
          <thead><tr style={{background:"#f4f8f5"}}>{["Resident","Unit","Balance"].map(h => <th key={h} style={{padding:"0.48rem 0.9rem",textAlign:h==="Balance"?"right":"left",color:"#4a6352",fontWeight:800,fontSize:"0.7rem",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{bals.map(r => (
            <tr key={r.id} style={{borderBottom:"1px solid #eef3ef"}}>
              <td style={{padding:"0.52rem 0.9rem",fontWeight:700}}>{r.name}</td>
              <td style={{padding:"0.52rem 0.9rem",color:"#6b7f72"}}>{r.unit}</td>
              <td style={{padding:"0.52rem 0.9rem",textAlign:"right"}}>{r.bal>0?<BDG c="#c0392b" bg="#fff1f0">KES {fmt(r.bal)} owed</BDG>:r.bal<0?<BDG c="#2471a3" bg="#eaf3fb">KES {fmt(Math.abs(r.bal))} credit</BDG>:<BDG c="#1a6b3a" bg="#eaf5ed">✓ Settled</BDG>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// RESIDENTS
// ══════════════════════════════════════════════════════════════
function Residents({ residents, setResidents, transactions, setTransactions, contribs, setContribs, authMode, authToken, authUser, toast }) {
  const [view, setView] = useState(null);
  const [edit, setEdit] = useState(null);
  const [add, setAdd] = useState(false);
  const [fm, setFm] = useState({name:"",unit:"",phone:"",notes:""});
    const { confirm, dialog } = useConfirm();
  const save = (isNew) => {
    if (!fm.name.trim()) { toast("Name required","error"); return; }
    if (!fm.unit.trim()) { toast("Unit number required","error"); return; }
    if (isNew) { setResidents(p => [...p, {id:uid(),...fm}]); toast(`${fm.name} added`); }
    else { setResidents(p => p.map(r => r.id===edit ? {...r,...fm} : r)); toast("Resident updated"); }
    setFm({name:"",unit:"",phone:"",notes:""}); setAdd(false); setEdit(null);
  };
  const del = async (r) => {
    if (!await confirm(`Remove ${r.name} and all related transactions and contributions?\n\nThis cannot be undone.`)) return;
    setResidents(p => removeResidentData(r.id, p, [], []).residents);
    setTransactions(p => removeResidentData(r.id, [], p, []).transactions);
    setContribs(p => removeResidentData(r.id, [], [], p).contribs);
    toast(`${r.name} removed`,"warn");
  };
  if (view) return <Statement resident={view} transactions={transactions} setTransactions={setTransactions} authMode={authMode} authToken={authToken} authUser={authUser} onBack={() => setView(null)} toast={toast}/>;
  return (
    <div>
      <div style={{...FL,justifyContent:"space-between",marginBottom:"1.35rem"}}>
        <div><h2 style={{margin:0,fontSize:"1.3rem",fontWeight:900,color:"#0f2417"}}>Residents</h2><p style={{margin:"0.2rem 0 0",color:"#6b7f72",fontSize:"0.84rem"}}>{residents.length} units registered</p></div>
        <BTN onClick={() => { setFm({name:"",unit:"",phone:"",notes:""}); setAdd(true); }}><Ico n="plus" sz={15}/> Add Resident</BTN>
      </div>
      <div style={{display:"grid",gap:"0.65rem"}}>
        {residents.map(r => {
          const bal = calcBal(r.id, transactions);
          const pmts = transactions.filter(t => t.residentId===r.id && t.type==="payment").length;
          const hasTransactions = transactions.some(t => t.residentId===r.id);
          return (
            <div key={r.id} style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",padding:"0.95rem 1.15rem",...FL,gap:"1rem",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
              <div style={{width:42,height:42,borderRadius:"50%",background:`hsl(${(r.name.charCodeAt(0)*17)%360},42%,87%)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:"#0f2417",fontSize:"1rem",flexShrink:0}}>{r.name[0].toUpperCase()}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:800,color:"#0f2417"}}>{r.name}</div>
                <div style={{fontSize:"0.76rem",color:"#6b7f72"}}>Unit {r.unit}{r.phone?` · ${r.phone}`:""} · {pmts} payment{pmts!==1?"s":""}</div>
                {r.notes && <div style={{fontSize:"0.72rem",color:"#8a9e91",fontStyle:"italic",marginTop:2}}>{r.notes}</div>}
              </div>
              <div style={{...FL,gap:"0.55rem",flexShrink:0}}>
                {bal>0?<BDG c="#c0392b" bg="#fff1f0">KES {fmt(bal)} owed</BDG>:bal<0?<BDG c="#2471a3" bg="#eaf3fb">+KES {fmt(Math.abs(bal))}</BDG>:<BDG c="#1a6b3a" bg="#eaf5ed">✓</BDG>}
                <BTN v="sec" sz="sm" onClick={() => setView(r)}>Statement</BTN>
                <BTN v="gho" sz="sm" onClick={() => { setEdit(r.id); setFm({name:r.name,unit:r.unit,phone:r.phone||"",notes:r.notes||""}); }}><Ico n="edit" sz={13}/></BTN>
                <BTN v="dan" sz="sm" disabled={hasTransactions} title={hasTransactions?"Residents with posted transactions cannot be removed":"Remove resident"} onClick={() => del(r)}><Ico n="trash" sz={13}/></BTN>
              </div>
            </div>
          );
        })}
      </div>
      {(add||edit) && (
        <Modal title={edit?"Edit Resident":"Add Resident"} onClose={() => { setAdd(false); setEdit(null); }}>
          <FLD label="Full Name"><INP value={fm.name} onChange={e => setFm(p=>({...p,name:e.target.value}))} placeholder="e.g. John Kamau" autoFocus/></FLD>
          <FLD label="Unit Number"><INP value={fm.unit} onChange={e => setFm(p=>({...p,unit:e.target.value}))} placeholder="e.g. A9"/></FLD>
          <FLD label="Phone (optional)"><INP value={fm.phone} onChange={e => setFm(p=>({...p,phone:e.target.value}))} placeholder="e.g. 0712 345 678"/></FLD>
          <FLD label="Notes (optional)"><textarea value={fm.notes} onChange={e => setFm(p=>({...p,notes:e.target.value}))} placeholder="Internal note about this resident" rows={2} style={{width:"100%",padding:"0.57rem 0.78rem",border:"1.5px solid #c8d8cb",borderRadius:8,fontSize:"0.875rem",boxSizing:"border-box",fontFamily:"inherit",resize:"vertical"}}/></FLD>
          <div style={{...FL,justifyContent:"flex-end",gap:"0.65rem",marginTop:"1rem"}}>
            <BTN v="sec" onClick={() => { setAdd(false); setEdit(null); }}>Cancel</BTN>
            <BTN onClick={() => save(!edit)}><Ico n="check" sz={13}/> {edit?"Save Changes":"Add"}</BTN>
          </div>
        </Modal>
      )}
      {dialog}
    </div>
  );
}

// ── Statement ──────────────────────────────────────────────────
function Statement({ resident, transactions, setTransactions, authMode, authToken, authUser, onBack, toast }) {
  const [showPay, setShowPay] = useState(false);
  const [showChg, setShowChg] = useState(false);
  const [rec, setRec] = useState(null);
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [correctionTxn, setCorrectionTxn] = useState(null);
  const [correctionForm, setCorrectionForm] = useState({mode:"reverse",reason:"",date:today(),type:"charge",amount:"",security:"",others:"",note:""});
  const [pFm, setPFm] = useState({date:today(),amount:"",note:"Payment",mpesa:""});
  const [cFm, setCFm] = useState({date:today(),security:MONTHLY_SECURITY,others:MONTHLY_OTHERS,note:"Monthly levy"});
  const {confirm, dialog} = useConfirm();
  const myT = [...transactions].filter(t => t.residentId===resident.id);
  const rows = runningBalance(myT);
  const trueBal = rows.length ? rows[rows.length-1].run : 0;
  const shown = rows.filter(t => {
    if (q && !t.note?.toLowerCase().includes(q.toLowerCase()) && !t.date.includes(q) && !String(t.amount).includes(q)) return false;
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  });
  const isFiltered = Boolean(q || dateFrom || dateTo);
  const exportThisCSV = () => {
    exportCSV(`statement-${resident.name.replace(/\s+/g,"-")}-${today()}.csv`, ["Date","Description","Type","M-Pesa reference","Charge","Payment","Adjustment","Balance"], shown.map(t => [t.date,t.note,t.type,t.mpesa || "",t.type==="charge"?t.amount:"",t.type==="payment"?t.amount:"",t.type==="reversal"?t.balanceEffect:"",t.run]));
    toast("Statement exported to CSV");
  };
  const addPay = async () => {
    const a = Number(pFm.amount);
    if (!Number.isSafeInteger(a)||a<=0) { toast("Enter a positive whole-KES amount","error"); return; }
    if (a > trueBal && trueBal > 0 && !await confirm(`This payment (KES ${fmt(a)}) is more than the balance owed (KES ${fmt(trueBal)}).\n\nKES ${fmt(a-trueBal)} will be in credit. Continue?`)) return;
    setTransactions(p => [...p, {id:uid(),residentId:resident.id,date:pFm.date,type:"payment",amount:a,security:0,others:0,note:pFm.note,mpesa:pFm.mpesa.trim().toUpperCase()}]);
    toast(`KES ${fmt(a)} recorded${pFm.mpesa ? ` · M-Pesa ${pFm.mpesa.toUpperCase()}` : ""}`); setPFm({date:today(),amount:"",note:"Payment",mpesa:""}); setShowPay(false);
  };
  const addChg = () => {
    const s=Number(cFm.security)||0, o=Number(cFm.others)||0;
    if (!Number.isSafeInteger(s)||!Number.isSafeInteger(o)||s<0||o<0) { toast("Charge components must be whole KES","error"); return; }
    if (s + o <= 0) { toast("Enter a charge amount","error"); return; }
    setTransactions(p => [...p, {id:uid(),residentId:resident.id,date:cFm.date,type:"charge",amount:s+o,security:s,others:o,note:cFm.note}]);
    toast(`Charge KES ${fmt(s+o)} posted`); setCFm({date:today(),security:MONTHLY_SECURITY,others:MONTHLY_OTHERS,note:"Monthly levy"}); setShowChg(false);
  };
  const openCorrection = transaction => {
    setCorrectionTxn(transaction);
    setCorrectionForm({mode:"reverse",reason:"",date:transaction.date,type:transaction.type,amount:String(transaction.amount),security:String(transaction.security||0),others:String(transaction.others||0),note:transaction.note||""});
  };
  const saveCorrection = async () => {
    const reason=correctionForm.reason.trim();
    if (!correctionTxn || reason.length<5) { toast("Enter a correction reason of at least 5 characters","error"); return; }
    let replacement;
    if (correctionForm.mode === "replace") {
      const amount=Number(correctionForm.amount), security=Number(correctionForm.security)||0, others=Number(correctionForm.others)||0;
      if (!Number.isSafeInteger(amount)||amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(correctionForm.date)) { toast("Enter a valid date and positive whole-KES amount","error"); return; }
      if (correctionForm.type === "charge" && (!Number.isSafeInteger(security)||!Number.isSafeInteger(others)||security<0||others<0||security+others!==amount)) { toast("Charge split must be whole KES and match the amount","error"); return; }
      replacement={residentId:resident.id,date:correctionForm.date,type:correctionForm.type,amount,security:correctionForm.type==="charge"?security:0,others:correctionForm.type==="charge"?others:0,note:correctionForm.note.trim()};
    }
    if (!await confirm(`Preserve transaction ${correctionTxn.id} and record a ${replacement?"reversal plus corrected replacement":"reversal"}?\n\nReason: ${reason}`)) return;
    try {
      let additions, correctionId;
      if (authMode === "signed-in") {
        const result=await apiRequest(`/transactions/${encodeURIComponent(correctionTxn.id)}/corrections`,{method:"POST",body:JSON.stringify({reason,...(replacement?{replacement}:{})})},authToken);
        additions=result.transactions; correctionId=result.correctionId;
      } else {
        correctionId=uid();
        const now=new Date().toISOString();
        additions=[{id:uid(),residentId:resident.id,date:today(),type:"reversal",amount:Number(correctionTxn.amount),balanceEffect:correctionTxn.type==="payment"?Number(correctionTxn.amount):-Number(correctionTxn.amount),note:`Reversal of ${correctionTxn.id}`,reversalOf:correctionTxn.id,correctionId,reason,recordedBy:authUser?.name||"Local offline user",enteredAt:now}];
        if (replacement) additions.push({...replacement,id:uid(),correctionId,corrects:correctionTxn.id,reason,recordedBy:authUser?.name||"Local offline user",enteredAt:now});
      }
      const nextTransactions=[...transactions,...additions];
      setTransactions(nextTransactions);
      const newBalance=calcBal(resident.id,nextTransactions);
      const balanceLabel=newBalance<0?`KES ${fmt(Math.abs(newBalance))} credit`:newBalance>0?`KES ${fmt(newBalance)} owed`:"settled";
      toast(`Correction recorded · new balance ${balanceLabel}`);
      setCorrectionTxn(null);
    } catch (error) { toast(error.message||"Could not record correction","error"); }
  };
  return (
    <div>
      <div style={{...FL,gap:"0.7rem",marginBottom:"1.2rem",flexWrap:"wrap"}}>
        <BTN v="gho" sz="sm" onClick={onBack}><Ico n="back" sz={14}/> Back</BTN>
        <div style={{flex:1}}><h2 style={{margin:0,fontSize:"1.2rem",fontWeight:900,color:"#0f2417"}}>{resident.name}</h2><div style={{fontSize:"0.77rem",color:"#6b7f72"}}>Unit {resident.unit} · Statement</div></div>
        <div style={{background:"#fff",border:"1px solid #e2ece4",borderRadius:10,padding:"0.58rem 0.9rem",textAlign:"right"}}>
          <div style={{fontSize:"0.69rem",color:"#6b7f72",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.055em"}}>Balance</div>
          <div style={{fontWeight:900,fontSize:"1.1rem",fontVariantNumeric:"tabular-nums",color:trueBal>0?"#c0392b":trueBal<0?"#2471a3":"#1a6b3a"}}>
            {trueBal>0?`KES ${fmt(trueBal)} owed`:trueBal<0?`KES ${fmt(Math.abs(trueBal))} credit`:"✓ Settled"}
          </div>
        </div>
      </div>
      <div style={{...FL,gap:"0.55rem",marginBottom:"0.9rem",flexWrap:"wrap"}}>
        <div className="no-print" style={{...FL,gap:"0.55rem",flexWrap:"wrap",width:"100%"}}>
          <BTN onClick={() => setShowPay(true)}><Ico n="check" sz={14}/> Record Payment</BTN>
          <BTN v="sec" onClick={() => setShowChg(true)}><Ico n="plus" sz={14}/> Add Charge</BTN>
          <BTN v="gho" onClick={() => printStatement(resident, rows, trueBal)}>🖨 Print</BTN>
          <BTN v="gho" onClick={exportThisCSV}>⇩ Export CSV</BTN>
          <BTN v={showFilter?"sec":"gho"} onClick={() => setShowFilter(p => !p)} style={{marginLeft:"auto"}}>⚑ Filter{isFiltered?" •":""}</BTN>
          <INP value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{width:180,marginLeft:"auto"}}/>
        </div>
      </div>
      {showFilter && <div className="no-print" style={{background:"#f4f8f5",borderRadius:10,padding:"0.85rem 1rem",marginBottom:"0.9rem",display:"flex",gap:"0.75rem",alignItems:"flex-end",flexWrap:"wrap"}}>
        <FLD label="From date"><INP type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{width:155}}/></FLD>
        <FLD label="To date"><INP type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{width:155}}/></FLD>
        <BTN v="sec" sz="sm" onClick={() => { setDateFrom(""); setDateTo(""); setQ(""); }}>Clear filters</BTN>
        {isFiltered && <span style={{fontSize:"0.78rem",color:"#1a6b3a",fontWeight:700}}>Showing {shown.length} of {rows.length} transactions</span>}
      </div>}
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",overflow:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.79rem",minWidth:650}}>
          <thead><tr style={{background:"#f4f8f5"}}>{["Date","Description","Charge","Payment","Adjustment","Balance",""].map((h,i) => <th key={i} style={{padding:"0.52rem 0.78rem",textAlign:i>=2&&i<6?"right":"left",color:"#4a6352",fontWeight:800,fontSize:"0.69rem",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>
            {shown.length===0 && <tr><td colSpan={7} style={{textAlign:"center",padding:"2.5rem",color:"#8a9e91",fontStyle:"italic"}}>{q?"No matches":"No transactions yet"}</td></tr>}
            {shown.map(t => (
              <tr key={t.id} style={{borderBottom:"1px solid #eef3ef",cursor:"pointer"}} onClick={() => setRec(t)}>
                <td style={{padding:"0.48rem 0.78rem",color:"#4a6352",whiteSpace:"nowrap"}}>{t.date}</td>
                <td style={{padding:"0.48rem 0.78rem",color:"#0f2417",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.note}</td>
                <td style={{padding:"0.48rem 0.78rem",textAlign:"right",color:"#c0392b",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{t.type==="charge"?`KES ${fmt(t.amount)}`:""}</td>
                <td style={{padding:"0.48rem 0.78rem",textAlign:"right",color:"#1a6b3a",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{t.type==="payment"?`KES ${fmt(t.amount)}`:""}</td>
                <td style={{padding:"0.48rem 0.78rem",textAlign:"right",color:t.balanceEffect<0?"#c0392b":"#2471a3",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{t.type==="reversal"?`KES ${fmt(t.balanceEffect)}`:""}</td>
                <td style={{padding:"0.48rem 0.78rem",textAlign:"right",fontWeight:800,fontVariantNumeric:"tabular-nums",color:t.run>0?"#c0392b":t.run<0?"#2471a3":"#1a6b3a"}}>KES {fmt(Math.abs(t.run))}{t.run<0?" Cr":""}</td>
                <td style={{padding:"0.48rem 0.6rem",textAlign:"right"}} onClick={e => e.stopPropagation()}>{["charge","payment"].includes(t.type)&&<BTN v="gho" sz="sm" title="Reverse or correct this posted transaction" onClick={() => openCorrection(t)} style={{padding:"3px 6px"}}>Correct</BTN>}</td>
              </tr>
            ))}
          </tbody>
          {shown.length>0 && <tfoot><tr style={{background:"#f4f8f5",fontWeight:900}}>
            <td colSpan={2} style={{padding:"0.58rem 0.78rem",color:"#0f2417"}}>Totals{isFiltered?" (filtered)":""}</td>
            <td style={{padding:"0.58rem 0.78rem",textAlign:"right",color:"#c0392b",fontVariantNumeric:"tabular-nums"}}>KES {fmt(shown.filter(t=>t.type==="charge").reduce((s,t)=>s+t.amount,0))}</td>
            <td style={{padding:"0.58rem 0.78rem",textAlign:"right",color:"#1a6b3a",fontVariantNumeric:"tabular-nums"}}>KES {fmt(shown.filter(t=>t.type==="payment").reduce((s,t)=>s+t.amount,0))}</td>
            <td style={{padding:"0.58rem 0.78rem",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>KES {fmt(shown.filter(t=>t.type==="reversal").reduce((s,t)=>s+(Number(t.balanceEffect)||0),0))}</td>
            <td style={{padding:"0.58rem 0.78rem",textAlign:"right",color:trueBal>0?"#c0392b":trueBal<0?"#2471a3":"#1a6b3a",fontVariantNumeric:"tabular-nums"}}>{isFiltered?"—":`KES ${fmt(Math.abs(trueBal))}${trueBal<0?" Cr":""}`}</td>
            <td/>
          </tr></tfoot>}
        </table>
      </div>
      <div style={{fontSize:"0.71rem",color:"#8a9e91",marginTop:"0.45rem",textAlign:"right"}}>💡 Click any row to view receipt · Last entry: {rows.length ? rows[rows.length-1].date : "—"}</div>
      {rec && <Receipt txn={rec} res={resident} onClose={() => setRec(null)}/>}
      {showPay && <Modal title={`Record Payment — ${resident.name}`} onClose={() => setShowPay(false)}>
        <FLD label="Date"><INP type="date" value={pFm.date} onChange={e=>setPFm(p=>({...p,date:e.target.value}))}/></FLD>
          <FLD label="Amount (KES)"><INP type="number" value={pFm.amount} onChange={e=>setPFm(p=>({...p,amount:e.target.value}))} placeholder="e.g. 4000" autoFocus/></FLD>
          <FLD label="M-Pesa reference (optional)" hint="Leave blank for cash or cheque"><INP value={pFm.mpesa} onChange={e=>setPFm(p=>({...p,mpesa:e.target.value.toUpperCase()}))} placeholder="e.g. QKJ3A1BX2R" style={{fontFamily:"monospace",letterSpacing:"0.08em"}}/></FLD>
        <FLD label="Note"><INP value={pFm.note} onChange={e=>setPFm(p=>({...p,note:e.target.value}))}/></FLD>
        <div style={{...FL,justifyContent:"flex-end",gap:"0.65rem"}}>
          <BTN v="sec" onClick={() => setShowPay(false)}>Cancel</BTN>
          <BTN onClick={addPay}><Ico n="check" sz={13}/> Save</BTN>
        </div>
      </Modal>}
      {showChg && <Modal title={`Add Charge — ${resident.name}`} onClose={() => setShowChg(false)}>
        <FLD label="Date"><INP type="date" value={cFm.date} onChange={e=>setCFm(p=>({...p,date:e.target.value}))}/></FLD>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.7rem"}}>
          <FLD label="Security (KES)"><INP type="number" value={cFm.security} onChange={e=>setCFm(p=>({...p,security:e.target.value}))}/></FLD>
          <FLD label="Others (KES)"><INP type="number" value={cFm.others} onChange={e=>setCFm(p=>({...p,others:e.target.value}))}/></FLD>
        </div>
        <FLD label="Note"><INP value={cFm.note} onChange={e=>setCFm(p=>({...p,note:e.target.value}))}/></FLD>
        <div style={{background:"#f4f8f5",borderRadius:8,padding:"0.6rem 0.85rem",fontSize:"0.87rem",fontWeight:800,color:"#0f2417",marginBottom:"0.9rem"}}>
          Total: KES {fmt((parseFloat(cFm.security)||0)+(parseFloat(cFm.others)||0))}
        </div>
        <div style={{...FL,justifyContent:"flex-end",gap:"0.65rem"}}>
          <BTN v="sec" onClick={() => setShowChg(false)}>Cancel</BTN>
          <BTN onClick={addChg}><Ico n="plus" sz={13}/> Post Charge</BTN>
        </div>
      </Modal>}
      {correctionTxn && <Modal title="Correct or reverse transaction" onClose={() => setCorrectionTxn(null)} w={520}>
        <div style={{background:"#f4f8f5",borderRadius:8,padding:"0.7rem 0.85rem",fontSize:"0.8rem",lineHeight:1.55,marginBottom:"0.9rem"}}>
          Original remains on the ledger: <b>{correctionTxn.date} · {correctionTxn.note} · KES {fmt(correctionTxn.amount)}</b> ({correctionTxn.type}). A correction adds linked entries; it never edits or removes this transaction.
        </div>
        <FLD label="Correction reason"><TXA rows={3} value={correctionForm.reason} onChange={e=>setCorrectionForm(p=>({...p,reason:e.target.value}))} placeholder="Explain why the posted transaction is being corrected"/></FLD>
        <FLD label="Action"><SEL value={correctionForm.mode} onChange={e=>setCorrectionForm(p=>({...p,mode:e.target.value}))}><option value="reverse">Reverse only</option><option value="replace">Reverse and replace with corrected entry</option></SEL></FLD>
        {correctionForm.mode==="replace" && <>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.7rem"}}>
            <FLD label="Corrected type"><SEL value={correctionForm.type} onChange={e=>setCorrectionForm(p=>({...p,type:e.target.value}))}><option value="charge">Charge</option><option value="payment">Payment</option></SEL></FLD>
            <FLD label="Transaction date"><INP type="date" value={correctionForm.date} onChange={e=>setCorrectionForm(p=>({...p,date:e.target.value}))}/></FLD>
            <FLD label="Amount (KES)"><INP type="number" min="1" step="1" value={correctionForm.amount} onChange={e=>setCorrectionForm(p=>({...p,amount:e.target.value}))}/></FLD>
            {correctionForm.type==="charge" && <>
              <FLD label="Security (KES)"><INP type="number" min="0" step="1" value={correctionForm.security} onChange={e=>setCorrectionForm(p=>({...p,security:e.target.value}))}/></FLD>
              <FLD label="Others (KES)"><INP type="number" min="0" step="1" value={correctionForm.others} onChange={e=>setCorrectionForm(p=>({...p,others:e.target.value}))}/></FLD>
            </>}
          </div>
          <FLD label="Corrected description"><INP value={correctionForm.note} onChange={e=>setCorrectionForm(p=>({...p,note:e.target.value}))}/></FLD>
        </>}
        {authMode==="offline" && <div style={{fontSize:"0.75rem",color:"#80530e",marginBottom:"0.8rem"}}>Offline demo correction is stored locally and is not a server audit record.</div>}
        <div style={{...FL,justifyContent:"flex-end",gap:"0.65rem"}}><BTN v="sec" onClick={()=>setCorrectionTxn(null)}>Cancel</BTN><BTN onClick={saveCorrection}><Ico n="check" sz={13}/> Confirm Correction</BTN></div>
      </Modal>}
      {dialog}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PAYMENTS
// ══════════════════════════════════════════════════════════════
function Payments({ residents, transactions, setTransactions, toast }) {
  const [tab, setTab] = useState("bulk");
  const [bSel, setBSel] = useState(() => Object.fromEntries(residents.map(r => [r.id, true])));
  const [bDate, setBDate] = useState(today());
  const [bSec, setBSec] = useState(MONTHLY_SECURITY);
  const [bOth, setBOth] = useState(MONTHLY_OTHERS);
  const [sFm, setSFm] = useState({residentId:"",date:today(),amount:"",note:"Payment",mpesa:""});
  const {confirm, dialog} = useConfirm();
  useEffect(() => setBSel(p => { const n={...p}; residents.forEach(r => { if(!(r.id in n)) n[r.id]=true; }); return n; }), [residents]);
  const postLevy = async () => {
    const s=parseFloat(bSec)||0, o=parseFloat(bOth)||0, tot=s+o;
    const tgts = residents.filter(r => bSel[r.id]);
    if (!tgts.length) { toast("Select at least one resident","error"); return; }
    const duplicates = tgts.filter(r => hasDuplicateCharge(transactions, r.id, bDate));
    if (duplicates.length && !await confirm(`Warning: ${duplicates.map(r=>r.name).join(", ")} already have a charge for ${bDate.slice(0,7)}.\n\nPost anyway to create a duplicate?`)) return;
    if (!await confirm(`Post KES ${fmt(tot)} to ${tgts.length} resident(s) on ${bDate}?`)) return;
    setTransactions(p => [...p, ...tgts.map(r => ({id:uid(),residentId:r.id,date:bDate,type:"charge",amount:tot,security:s,others:o,note:"Monthly levy"}))]);
    toast(`Levy posted to ${tgts.length} resident${tgts.length!==1?"s":""}`);
  };
  const recSingle = async () => {
    if (!sFm.residentId) { toast("Select a resident","error"); return; }
    const a = parseFloat(sFm.amount);
    if (!a||a<=0) { toast("Enter valid amount","error"); return; }
    const balance = calcBal(sFm.residentId, transactions);
    if (a > balance && balance > 0 && !await confirm(`This payment (KES ${fmt(a)}) is more than the balance owed (KES ${fmt(balance)}).\n\nKES ${fmt(a-balance)} will be in credit. Continue?`)) return;
    setTransactions(p => [...p, {id:uid(),residentId:sFm.residentId,date:sFm.date,type:"payment",amount:a,security:0,others:0,note:sFm.note,mpesa:sFm.mpesa.trim().toUpperCase()}]);
    const r = residents.find(x => x.id===sFm.residentId);
    toast(`KES ${fmt(a)} from ${r?.name}${sFm.mpesa ? ` · M-Pesa ${sFm.mpesa.toUpperCase()}` : ""}`);
    setSFm(p => ({...p,residentId:"",amount:"",note:"Payment",mpesa:""}));
  };
  const hist = [...transactions].filter(t => t.type==="payment").sort((a,b) => b.date.localeCompare(a.date)).slice(0,50);
  const Tab = ({id,lbl}) => <button onClick={() => setTab(id)} style={{padding:"0.46rem 0.95rem",border:"none",borderRadius:8,fontSize:"0.82rem",fontWeight:800,cursor:"pointer",background:tab===id?"#1a6b3a":"transparent",color:tab===id?"#fff":"#4a6352"}}>{lbl}</button>;
  return (
    <div>
      <h2 style={{margin:"0 0 1.2rem",fontSize:"1.3rem",fontWeight:900,color:"#0f2417"}}>Payments</h2>
      <div style={{...FL,gap:3,background:"#e8f0eb",borderRadius:10,padding:3,width:"fit-content",marginBottom:"1.35rem"}}>
        <Tab id="bulk" lbl="📋 Monthly Levy"/><Tab id="single" lbl="💳 Single Payment"/><Tab id="history" lbl="🕒 History"/>
      </div>
      {tab==="bulk" && <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",padding:"1.35rem"}}>
        <p style={{margin:"0 0 1.1rem",color:"#4a6352",fontSize:"0.87rem",lineHeight:1.6}}>Post the monthly security levy to multiple residents at once.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:"0.7rem",marginBottom:"0.9rem"}}>
          <FLD label="Date"><INP type="date" value={bDate} onChange={e => setBDate(e.target.value)}/></FLD>
          <FLD label="Security (KES)"><INP type="number" value={bSec} onChange={e => setBSec(e.target.value)}/></FLD>
          <FLD label="Others (KES)"><INP type="number" value={bOth} onChange={e => setBOth(e.target.value)}/></FLD>
        </div>
        <div style={{background:"#eaf5ed",borderRadius:8,padding:"0.62rem 0.9rem",marginBottom:"1.1rem",fontWeight:800,fontSize:"0.87rem",color:"#1a6b3a"}}>Total per resident: KES {fmt((parseFloat(bSec)||0)+(parseFloat(bOth)||0))}</div>
        <FLD label="Select Residents">
          <div style={{border:"1.5px solid #c8d8cb",borderRadius:8,overflow:"hidden"}}>
            <label style={{...FL,gap:9,padding:"0.58rem 0.88rem",background:"#f4f8f5",borderBottom:"1px solid #c8d8cb",cursor:"pointer",fontWeight:800,fontSize:"0.83rem"}}>
              <input type="checkbox" checked={residents.every(r => bSel[r.id])} onChange={e => { const s={}; residents.forEach(r => s[r.id]=e.target.checked); setBSel(s); }} style={{width:15,height:15}}/>
              Select All
            </label>
            {residents.map(r => { const bal=calcBal(r.id,transactions); return (
              <label key={r.id} style={{...FL,gap:9,padding:"0.53rem 0.88rem",borderBottom:"1px solid #eef3ef",cursor:"pointer",fontSize:"0.84rem"}}>
                <input type="checkbox" checked={!!bSel[r.id]} onChange={e => setBSel(p => ({...p,[r.id]:e.target.checked}))} style={{width:15,height:15}}/>
                <span style={{flex:1}}>{r.name} <span style={{color:"#8a9e91"}}>· {r.unit}</span></span>
                {bal>0 && <span style={{fontSize:"0.71rem",color:"#c0392b",fontWeight:800}}>KES {fmt(bal)} owed</span>}
              </label>
            ); })}
          </div>
        </FLD>
        <BTN sz="lg" onClick={postLevy}><Ico n="check" sz={16}/> Post to {residents.filter(r=>bSel[r.id]).length} Resident{residents.filter(r=>bSel[r.id]).length!==1?"s":""}</BTN>
      </div>}
      {tab==="single" && <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",padding:"1.35rem",maxWidth:460}}>
        <FLD label="Resident"><SEL value={sFm.residentId} onChange={e => setSFm(p=>({...p,residentId:e.target.value}))}>
          <option value="">-- Select resident --</option>
          {residents.map(r => { const bal=calcBal(r.id,transactions); return <option key={r.id} value={r.id}>{r.name} ({r.unit}){bal>0?` — owes KES ${fmt(bal)}`:""}</option>; })}
        </SEL></FLD>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.7rem"}}>
          <FLD label="Date"><INP type="date" value={sFm.date} onChange={e => setSFm(p=>({...p,date:e.target.value}))}/></FLD>
          <FLD label="Amount (KES)"><INP type="number" value={sFm.amount} onChange={e => setSFm(p=>({...p,amount:e.target.value}))} placeholder="4000"/></FLD>
        </div>
        <FLD label="M-Pesa reference (optional)"><INP value={sFm.mpesa} onChange={e=>setSFm(p=>({...p,mpesa:e.target.value.toUpperCase()}))} placeholder="e.g. QKJ3A1BX2R" style={{fontFamily:"monospace",letterSpacing:"0.08em"}}/></FLD>
        <FLD label="Note"><INP value={sFm.note} onChange={e => setSFm(p=>({...p,note:e.target.value}))}/></FLD>
        <BTN onClick={recSingle}><Ico n="check" sz={14}/> Record Payment</BTN>
      </div>}
      {tab==="history" && <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",overflow:"auto"}}>
        <div style={{...FL,justifyContent:"space-between",padding:"0.75rem 1rem",borderBottom:"1px solid #e2ece4"}}>
          <span style={{fontWeight:800,color:"#0f2417",fontSize:"0.86rem"}}>Recent Payments ({hist.length})</span>
          <BTN v="gho" sz="sm" onClick={() => exportCSV(`payments-${today()}.csv`,["Date","Resident","Unit","Amount","M-Pesa reference","Note"],hist.map(t => { const r=residents.find(x=>x.id===t.residentId); return [t.date,r?.name,r?.unit,t.amount,t.mpesa || "",t.note]; }))}>⇩ Export CSV</BTN>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.8rem",minWidth:380}}>
          <thead><tr style={{background:"#f4f8f5"}}>{["Date","Resident","Unit","Amount","Note"].map(h => <th key={h} style={{padding:"0.48rem 0.9rem",textAlign:h==="Amount"?"right":"left",color:"#4a6352",fontWeight:800,fontSize:"0.7rem",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{hist.length===0?<tr><td colSpan={5} style={{textAlign:"center",padding:"2.5rem",color:"#8a9e91",fontStyle:"italic"}}>No payments yet</td></tr>:hist.map(t => { const r=residents.find(x=>x.id===t.residentId); return (
            <tr key={t.id} style={{borderBottom:"1px solid #eef3ef"}}>
              <td style={{padding:"0.48rem 0.9rem",color:"#4a6352",whiteSpace:"nowrap"}}>{t.date}</td>
              <td style={{padding:"0.48rem 0.9rem",fontWeight:700}}>{r?.name||"—"}</td>
              <td style={{padding:"0.48rem 0.9rem",color:"#6b7f72"}}>{r?.unit||"—"}</td>
              <td style={{padding:"0.48rem 0.9rem",textAlign:"right",color:"#1a6b3a",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>KES {fmt(t.amount)}</td>
              <td style={{padding:"0.48rem 0.9rem",color:"#6b7f72"}}>{t.note}</td>
            </tr>
          ); })}</tbody>
        </table>
      </div>}
      {dialog}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PROJECTS
// ══════════════════════════════════════════════════════════════
function Projects({ projects, setProjects, contribs, setContribs, residents, toast }) {
  const [addP, setAddP] = useState(false);
  const [addC, setAddC] = useState(null);
  const [pFm, setPFm] = useState({name:"",target:"",notes:""});
  const [cFm, setCFm] = useState({residentId:"",date:today(),amount:"",note:"Contribution"});
  const {confirm, dialog} = useConfirm();
  const saveP = () => { if(!pFm.name.trim()){toast("Name required","error");return;} setProjects(p=>[...p,{id:uid(),name:pFm.name.trim(),target:parseFloat(pFm.target)||0,notes:pFm.notes}]); toast("Project created"); setPFm({name:"",target:"",notes:""}); setAddP(false); };
  const saveC = (pid) => { if(!cFm.residentId||!cFm.amount){toast("Fill all fields","error");return;} setContribs(p=>[...p,{id:uid(),projectId:pid,residentId:cFm.residentId,date:cFm.date,amount:parseFloat(cFm.amount),note:cFm.note}]); toast("Contribution recorded"); setCFm({residentId:"",date:today(),amount:"",note:"Contribution"}); setAddC(null); };
  const delP = async (p) => { if(!await confirm(`Delete "${p.name}" and all contributions?\n\nThis cannot be undone.`))return; setProjects(prev=>prev.filter(x=>x.id!==p.id)); setContribs(prev=>prev.filter(c=>c.projectId!==p.id)); toast("Deleted","warn"); };
  return (
    <div>
      <div style={{...FL,justifyContent:"space-between",marginBottom:"1.35rem"}}>
        <div><h2 style={{margin:0,fontSize:"1.3rem",fontWeight:900,color:"#0f2417"}}>Projects</h2><p style={{margin:"0.2rem 0 0",color:"#6b7f72",fontSize:"0.84rem"}}>Special projects with funding targets</p></div>
        <BTN onClick={() => { setPFm({name:"",target:"",notes:""}); setAddP(true); }}><Ico n="plus" sz={15}/> New Project</BTN>
      </div>
      <div style={{background:"#fff8ec",border:"1px solid #f0d5a8",borderRadius:10,padding:"0.8rem 0.95rem",marginBottom:"1rem",fontSize:"0.8rem",color:"#80530e",lineHeight:1.6}}>
        Workbook evidence: estimated GateHouse costs KES {fmt(WORKBOOK_GATEHOUSE.estimatedTotal)}; actual expenditure KES {fmt(WORKBOOK_GATEHOUSE.actualTotal)}; variance KES {fmt(WORKBOOK_GATEHOUSE.overspend)}. The resident summaries separately record KES 80,000 for Additional Works. These are different accounting measures.
      </div>
      {projects.length===0 && <div style={{textAlign:"center",padding:"3.5rem 2rem",background:"#fff",borderRadius:12,border:"1px solid #e2ece4",color:"#8a9e91"}}><div style={{fontSize:"2.5rem",marginBottom:"0.75rem"}}>🔨</div><div style={{fontWeight:700,color:"#4a6352",marginBottom:"0.4rem"}}>No projects yet</div><div style={{fontSize:"0.84rem"}}>Create a project to track collective contributions.</div></div>}
      <div style={{display:"grid",gap:"0.9rem"}}>
        {projects.map(proj => {
          const pc = contribs.filter(c => c.projectId===proj.id);
          const coll = pc.reduce((s,c) => s+c.amount, 0);
          const pct = proj.target>0 ? Math.min(100,(coll/proj.target)*100) : 0;
          return (
            <div key={proj.id} style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",overflow:"hidden"}}>
              <div style={{padding:"1.15rem 1.35rem 0.9rem"}}>
                <div style={{...FL,justifyContent:"space-between",gap:"1rem",marginBottom:"0.7rem"}}>
                  <div><div style={{fontWeight:900,color:"#0f2417",fontSize:"1rem"}}>{proj.name}</div>{proj.notes&&<div style={{fontSize:"0.77rem",color:"#6b7f72",marginTop:2}}>{proj.notes}</div>}</div>
                  <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:"0.69rem",color:"#6b7f72",textTransform:"uppercase",fontWeight:800,letterSpacing:"0.05em"}}>Target</div><div style={{fontWeight:900,fontVariantNumeric:"tabular-nums",color:"#0f2417"}}>KES {fmt(proj.target)}</div></div>
                </div>
                <div style={{height:10,background:"#e8f0eb",borderRadius:99,overflow:"hidden",marginBottom:"0.5rem"}}><div style={{height:"100%",width:`${pct}%`,background:pct>=100?"#1a6b3a":pct>=60?"#27ae60":"#f39c12",borderRadius:99}}/></div>
                <div style={{...FL,justifyContent:"space-between",fontSize:"0.74rem",color:"#6b7f72",marginBottom:"0.85rem"}}><span><b style={{color:"#1a6b3a"}}>KES {fmt(coll)}</b> received from resident summaries ({pct.toFixed(1)}%)</span><span>{proj.target>coll?`KES ${fmt(proj.target-coll)} remaining`:coll>proj.target?`KES ${fmt(coll-proj.target)} above target`:"Target met"}</span></div>
                <div style={{...FL,justifyContent:"space-between"}}>
                  <BDG c="#1a6b3a" bg="#eaf5ed">{pc.length} contribution{pc.length!==1?"s":""}</BDG>
                  <div style={{...FL,gap:"0.5rem"}}><BTN v="sec" sz="sm" onClick={() => { setCFm({residentId:"",date:today(),amount:"",note:"Contribution"}); setAddC(proj.id); }}>+ Contribution</BTN><BTN v="dan" sz="sm" onClick={() => delP(proj)}><Ico n="trash" sz={12}/></BTN></div>
                </div>
              </div>
              {pc.length>0 && <div style={{borderTop:"1px solid #eef3ef",overflow:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.77rem"}}>
                  <thead><tr style={{background:"#f4f8f5"}}>{["Date","Resident","Amount"].map(h => <th key={h} style={{padding:"0.38rem 0.9rem",textAlign:h==="Amount"?"right":"left",color:"#4a6352",fontWeight:800,fontSize:"0.69rem",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                  <tbody>{pc.sort((a,b)=>(b.date||b.source||"").localeCompare(a.date||a.source||"")).map(c => { const r=residents.find(x=>x.id===c.residentId); return <tr key={c.id} style={{borderBottom:"1px solid #eef3ef"}}><td style={{padding:"0.38rem 0.9rem",color:"#4a6352"}}>{c.date || c.source || "Workbook summary"}</td><td style={{padding:"0.38rem 0.9rem",fontWeight:700}}>{r?.name}</td><td style={{padding:"0.38rem 0.9rem",textAlign:"right",color:"#1a6b3a",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>KES {fmt(c.amount)}</td></tr>; })}</tbody>
                </table>
              </div>}
            </div>
          );
        })}
      </div>
      <div style={{background:"#fff",border:"1px solid #e2ece4",borderRadius:12,overflow:"hidden",marginTop:"1rem"}}>
        <div style={{padding:"0.8rem 1rem",borderBottom:"1px solid #e2ece4",fontWeight:800,color:"#0f2417",fontSize:"0.88rem"}}>GateHouse expenditure detail · source rows 4–22</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.77rem",minWidth:600}}>
          <thead><tr style={{background:"#f4f8f5"}}>{["Date","Description","Estimated","Actual","Source / remarks"].map((heading,index)=><th key={heading} style={{padding:"0.48rem 0.75rem",textAlign:index>1&&index<4?"right":"left",color:"#4a6352",fontWeight:800,fontSize:"0.69rem",textTransform:"uppercase"}}>{heading}</th>)}</tr></thead>
          <tbody>{WORKBOOK_GATEHOUSE_ITEMS.map(item=><tr key={item.row} style={{borderBottom:"1px solid #eef3ef"}}>
            <td style={{padding:"0.46rem 0.75rem",whiteSpace:"nowrap"}}>{item.date}</td>
            <td style={{padding:"0.46rem 0.75rem",fontWeight:700}}>{item.description}</td>
            <td style={{padding:"0.46rem 0.75rem",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{item.estimated===null?"—":`KES ${fmt(item.estimated)}`}</td>
            <td style={{padding:"0.46rem 0.75rem",textAlign:"right",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>KES {fmt(item.actual)}</td>
            <td style={{padding:"0.46rem 0.75rem",color:"#6b7f72"}}>{item.source}{item.remarks?` · ${item.remarks}`:""}</td>
          </tr>)}</tbody>
          <tfoot><tr style={{background:"#f4f8f5",fontWeight:900}}><td colSpan={2} style={{padding:"0.55rem 0.75rem"}}>Workbook total · variance KES {fmt(WORKBOOK_GATEHOUSE.overspend)}</td><td style={{padding:"0.55rem 0.75rem",textAlign:"right"}}>KES {fmt(WORKBOOK_GATEHOUSE.estimatedTotal)}</td><td style={{padding:"0.55rem 0.75rem",textAlign:"right"}}>KES {fmt(WORKBOOK_GATEHOUSE.actualTotal)}</td><td style={{padding:"0.55rem 0.75rem"}}>GateHouse!D26:F26</td></tr></tfoot>
        </table></div>
      </div>
      {addP && <Modal title="New Project" onClose={() => setAddP(false)}>
        <FLD label="Project Name"><INP value={pFm.name} onChange={e=>setPFm(p=>({...p,name:e.target.value}))} placeholder="e.g. Perimeter Wall" autoFocus/></FLD>
        <FLD label="Funding Target (KES)" hint="Total amount to raise"><INP type="number" value={pFm.target} onChange={e=>setPFm(p=>({...p,target:e.target.value}))} placeholder="e.g. 500000"/></FLD>
        <FLD label="Notes"><INP value={pFm.notes} onChange={e=>setPFm(p=>({...p,notes:e.target.value}))} placeholder="Brief description"/></FLD>
        <div style={{...FL,justifyContent:"flex-end",gap:"0.65rem",marginTop:"1rem"}}><BTN v="sec" onClick={() => setAddP(false)}>Cancel</BTN><BTN onClick={saveP}><Ico n="check" sz={13}/> Create</BTN></div>
      </Modal>}
      {addC && <Modal title={`Contribution — ${projects.find(p=>p.id===addC)?.name}`} onClose={() => setAddC(null)}>
        <FLD label="Resident"><SEL value={cFm.residentId} onChange={e=>setCFm(p=>({...p,residentId:e.target.value}))}><option value="">-- Select --</option>{residents.map(r=><option key={r.id} value={r.id}>{r.name} ({r.unit})</option>)}</SEL></FLD>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.7rem"}}><FLD label="Date"><INP type="date" value={cFm.date} onChange={e=>setCFm(p=>({...p,date:e.target.value}))}/></FLD><FLD label="Amount (KES)"><INP type="number" value={cFm.amount} onChange={e=>setCFm(p=>({...p,amount:e.target.value}))} placeholder="e.g. 10000"/></FLD></div>
        <FLD label="Note"><INP value={cFm.note} onChange={e=>setCFm(p=>({...p,note:e.target.value}))}/></FLD>
        <div style={{...FL,justifyContent:"flex-end",gap:"0.65rem",marginTop:"1rem"}}><BTN v="sec" onClick={() => setAddC(null)}>Cancel</BTN><BTN onClick={() => saveC(addC)}><Ico n="check" sz={13}/> Save</BTN></div>
      </Modal>}
      {dialog}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════════════
function Reports({ residents, transactions, provider, providerPayments }) {
  const yrs = [...new Set(transactions.map(t=>t.date.slice(0,4)))].sort().reverse();
  const [yr, setYr] = useState(yrs[0]||"2025");
  const mo = MONTHS.map((m,mi) => {
    const pre = `${yr}-${String(mi+1).padStart(2,"0")}`;
    const ch = transactions.filter(t=>t.date.startsWith(pre)&&t.type==="charge").reduce((s,t)=>s+t.amount,0);
    const pa = transactions.filter(t=>t.date.startsWith(pre)&&t.type==="payment").reduce((s,t)=>s+t.amount,0);
    return {m,ch,pa,diff:ch-pa};
  });
  const tCh=mo.reduce((s,m)=>s+m.ch,0), tPa=mo.reduce((s,m)=>s+m.pa,0);
  const rate = tCh>0 ? Math.round((tPa/tCh)*100) : 0;
  const mx = Math.max(...mo.flatMap(m=>[m.ch,m.pa]),1);
  const exportReport = () => exportCSV(`lemayian-court-report-${yr}.csv`,["Month","Levied","Collected","Deficit","Rate %"],mo.map(m => [`${m.m} ${yr}`,m.ch,m.pa,m.diff,m.ch>0?Math.round((m.pa/m.ch)*100):""]));
  const providerYearPayments=providerPayments.filter(item=>String(item.date||"").startsWith(yr));
  const providerYearTotal=providerYearPayments.reduce((sum,item)=>sum+(Number(item.amount)||0),0);
  const exportProviderReport=()=>exportCSV(`lemayian-provider-payments-${yr}.csv`,["Date","Billing period","Amount","Method","Reference","Status","Verification","Recorded by","Notes"],providerYearPayments.map(item=>[item.date,item.billingPeriod,item.amount,item.method,item.reference,item.status,item.verification,item.recordedBy?.name||item.recordedBy,item.notes]));
  const bals = residents.map(r => ({...r, paid:transactions.filter(t=>t.residentId===r.id&&t.type==="payment").reduce((s,t)=>s+t.amount,0), bal:calcBal(r.id,transactions)}));
  const recon = reconcile(residents, transactions);
  const mismatches = recon.filter(r => r.status === "mismatch");
  const openingConflicts = residents.filter(r => WORKBOOK_OPENING_2026[r.id] !== REQUESTED_OPENING_2026[r.id]);
  const yearBreaks = workbookYearBreaks();
  return (
    <div>
      <div style={{...FL,justifyContent:"space-between",marginBottom:"1.35rem",flexWrap:"wrap",gap:"0.7rem"}}>
        <div><h2 style={{margin:0,fontSize:"1.3rem",fontWeight:900,color:"#0f2417"}}>Reports</h2><p style={{margin:"0.2rem 0 0",color:"#6b7f72",fontSize:"0.84rem"}}>Collection performance & financial summary</p></div>
        <div style={{...FL,gap:"0.55rem"}}><LBL c="Year"/><SEL value={yr} onChange={e=>setYr(e.target.value)} style={{width:"auto",padding:"0.42rem 0.72rem"}}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}{!yrs.includes("2025")&&<option value="2025">2025</option>}</SEL><BTN v="sec" sz="sm" onClick={exportReport}>⇩ Export CSV</BTN><BTN v="gho" sz="sm" onClick={() => window.print()}>🖨 Print</BTN></div>
      </div>
      <div style={{background:"#fff8ec",border:"1px solid #f5dcb3",borderRadius:10,padding:"0.7rem 0.95rem",marginBottom:"1.1rem",fontSize:"0.79rem",color:"#8a5a12",lineHeight:1.6}}>
        <b>Levy rate history.</b> {LEVY_HISTORY_NOTE}
        <div style={{marginTop:"0.45rem",display:"grid",gap:"0.2rem"}}>
          {RATE_HISTORY.map(r => (
            <div key={r.period} style={{display:"flex",gap:"0.5rem",flexWrap:"wrap"}}>
              <span style={{fontWeight:800,minWidth:150}}>{r.period}</span>
              <span style={{fontVariantNumeric:"tabular-nums"}}>KES {fmt(r.total)}/month</span>
              <span style={{color:"#a8763a"}}>(Security KES {fmt(r.security)} + Others KES {fmt(r.others)})</span>
            </div>
          ))}
        </div>
      </div>
      {openingConflicts.length > 0 && <div role="status" style={{background:"#fff8ec",border:"1px solid #f0d5a8",borderRadius:10,padding:"0.75rem 0.95rem",marginBottom:"1.1rem",fontSize:"0.8rem",color:"#80530e",lineHeight:1.6}}>
        <b>Opening balance target conflict:</b> {openingConflicts.map(r => `${r.name}: requested KES ${fmt(REQUESTED_OPENING_2026[r.id])}, workbook KES ${fmt(WORKBOOK_OPENING_2026[r.id])}`).join("; ")}. The workbook value is retained in the ledger and used for reconciliation.
      </div>}
      {yearBreaks.length > 0 && <div style={{background:"#fff8ec",border:"1px solid #f0d5a8",borderRadius:12,overflow:"hidden",marginBottom:"1.1rem"}}>
        <div style={{padding:"0.7rem 1rem",background:"#fff3dc",fontWeight:800,color:"#80530e",fontSize:"0.84rem"}}>Historical carry-forward differences · {yearBreaks.length} source discrepancy{yearBreaks.length!==1?"ies":""}</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.76rem",minWidth:520}}>
          <thead><tr>{["Resident","From","Previous closing","To","Workbook opening","Difference"].map((h,i)=><th key={h} style={{padding:"0.42rem 0.7rem",textAlign:i>1?"right":"left",color:"#80530e",fontWeight:800,fontSize:"0.67rem",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{yearBreaks.map((item,index)=>{const resident=residents.find(r=>r.id===item.residentId); return <tr key={`${item.residentId}-${item.to}-${index}`} style={{borderTop:"1px solid #f0d5a8"}}>
            <td style={{padding:"0.42rem 0.7rem",fontWeight:700}}>{resident?.name || item.residentId}</td><td style={{padding:"0.42rem 0.7rem"}}>{item.from}</td>
            <td style={{padding:"0.42rem 0.7rem",textAlign:"right"}}>KES {fmt(item.previousClosing)}</td><td style={{padding:"0.42rem 0.7rem"}}>{item.to}</td>
            <td style={{padding:"0.42rem 0.7rem",textAlign:"right"}}>KES {fmt(item.thisOpening)}</td><td style={{padding:"0.42rem 0.7rem",textAlign:"right",fontWeight:800}}>KES {fmt(item.difference)}</td>
          </tr>;})}</tbody>
        </table></div>
      </div>}
      <div style={{background:"#fff",borderRadius:12,border:`1px solid ${mismatches.length?"#f5c5c2":"#e2ece4"}`,overflow:"hidden",marginBottom:"1.1rem"}}>
        <div style={{...FL,justifyContent:"space-between",padding:"0.75rem 1rem",borderBottom:"1px solid #e2ece4",background:mismatches.length?"#fff8f7":"#f4f8f5"}}>
          <span style={{fontWeight:800,color:"#0f2417",fontSize:"0.86rem"}}>Reconciliation vs. workbook — 2026</span>
          {mismatches.length===0
            ? <BDG c="#1a6b3a" bg="#eaf5ed">✓ All 8 residents reconciled</BDG>
            : <BDG c="#c0392b" bg="#fff1f0">{mismatches.length} mismatch{mismatches.length!==1?"es":""}</BDG>}
        </div>
        <div style={{overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.79rem",minWidth:600}}>
            <thead><tr style={{background:"#f4f8f5"}}>{["Resident","Opening","Charges","Payments","Adjustments","Calculated","Workbook","Diff"].map((h,i)=><th key={h} style={{padding:"0.48rem 0.88rem",textAlign:i===0?"left":"right",color:"#4a6352",fontWeight:800,fontSize:"0.69rem",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
            <tbody>
              {recon.map(r => (
                <tr key={r.id} style={{borderBottom:"1px solid #eef3ef"}}>
                  <td style={{padding:"0.48rem 0.88rem",fontWeight:700}}>{r.name}</td>
                  <td style={{padding:"0.48rem 0.88rem",textAlign:"right",fontVariantNumeric:"tabular-nums",color:"#4a6352"}}>KES {fmt(r.opening)}</td>
                  <td style={{padding:"0.48rem 0.88rem",textAlign:"right",fontVariantNumeric:"tabular-nums",color:"#c0392b"}}>KES {fmt(r.charges)}</td>
                  <td style={{padding:"0.48rem 0.88rem",textAlign:"right",fontVariantNumeric:"tabular-nums",color:"#1a6b3a"}}>KES {fmt(r.payments)}</td>
                  <td style={{padding:"0.48rem 0.88rem",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>KES {fmt(r.adjustments)}</td>
                  <td style={{padding:"0.48rem 0.88rem",textAlign:"right",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>KES {fmt(r.calculated)}</td>
                  <td style={{padding:"0.48rem 0.88rem",textAlign:"right",fontVariantNumeric:"tabular-nums",color:"#4a6352"}}>KES {fmt(r.expected)}</td>
                  <td style={{padding:"0.48rem 0.88rem",textAlign:"right"}}>{r.status==="reconciled"?<BDG c="#1a6b3a" bg="#eaf5ed">✓ 0</BDG>:<BDG c="#c0392b" bg="#fff1f0">KES {fmt(r.difference)}</BDG>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{padding:"0.6rem 1rem",fontSize:"0.74rem",color:"#8a9e91",borderTop:"1px solid #eef3ef",lineHeight:1.6}}>
          Closing = Opening + Charges − Payments + Adjustments. Imported from <b>Lemayian Court Accounts 2026.xlsx</b> — every imported transaction carries its source worksheet row.
        </div>
      </div>
      <div style={{background:"#fff",border:"1px solid #f0d5a8",borderRadius:12,overflow:"hidden",marginBottom:"1.1rem"}}>
        <div style={{padding:"0.75rem 1rem",borderBottom:"1px solid #f0d5a8",background:"#fff8ec",fontWeight:800,color:"#80530e",fontSize:"0.86rem"}}>Payment Details review · supporting evidence only</div>
        <div style={{padding:"0.65rem 1rem",fontSize:"0.76rem",color:"#80530e",lineHeight:1.55}}>The two KES 29,000 references do not match annual ledger credits by date and are excluded from resident balances to avoid double-counting. The KES 700 Grass planting and Weeding entries are expense notes, not resident payments.</div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.77rem",minWidth:560}}>
          <thead><tr style={{background:"#f4f8f5"}}>{["Date","Type","Amount","Reference / detail","Disposition"].map((h,i)=><th key={h} style={{padding:"0.46rem 0.8rem",textAlign:i===2?"right":"left",color:"#4a6352",fontWeight:800,fontSize:"0.68rem",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{WORKBOOK_PAYMENT_REFERENCES.map(item=><tr key={item.row} style={{borderBottom:"1px solid #eef3ef"}}>
            <td style={{padding:"0.45rem 0.8rem",whiteSpace:"nowrap"}}>{item.date}</td><td style={{padding:"0.45rem 0.8rem"}}>{item.kind}</td>
            <td style={{padding:"0.45rem 0.8rem",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>KES {fmt(item.amount)}</td>
            <td style={{padding:"0.45rem 0.8rem"}}>{item.reference || item.detail}<div style={{fontSize:"0.68rem",color:"#8a9e91"}}>{item.source}{item.reference?` · ${item.detail}`:""}</div></td>
            <td style={{padding:"0.45rem 0.8rem",color:"#80530e"}}>{item.status}</td>
          </tr>)}</tbody>
        </table></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:"0.8rem",marginBottom:"1.1rem"}}>
        {[{l:"Total Levied",v:tCh,co:"#c0392b"},{l:"Total Collected",v:tPa,co:"#1a6b3a"},{l:"Shortfall",v:tCh-tPa,co:"#e67e22"},{l:"Rate",v:null,rate,co:rate>=90?"#1a6b3a":rate>=70?"#e67e22":"#c0392b"}].map(c=>(
          <div key={c.l} style={{background:"#fff",borderRadius:12,padding:"0.95rem 1.1rem",border:"1px solid #e2ece4"}}>
            <div style={{fontSize:"0.71rem",fontWeight:800,color:"#6b7f72",textTransform:"uppercase",letterSpacing:"0.055em",marginBottom:"0.38rem"}}>{c.l}</div>
            {c.v!=null?<div style={{fontSize:"1.3rem",fontWeight:900,color:c.co,fontVariantNumeric:"tabular-nums"}}>KES {fmt(c.v)}</div>:<div style={{fontSize:"1.3rem",fontWeight:900,color:c.co}}>{c.rate}%</div>}
          </div>
        ))}
      </div>
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",padding:"1.1rem",marginBottom:"1.1rem"}}>
        <div style={{fontWeight:800,color:"#0f2417",fontSize:"0.85rem",marginBottom:"0.9rem"}}>Monthly Levy vs. Collections — {yr}</div>
        <div style={{display:"flex",gap:4,alignItems:"flex-end",height:110}}>
          {mo.map((m,i) => (
            <div key={i} style={{flex:1,minWidth:24,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <div style={{width:"100%",display:"flex",gap:2,alignItems:"flex-end",height:96}}>
                <div style={{flex:1,background:"#f5c5c2",borderRadius:"3px 3px 0 0",height:`${(m.ch/mx)*100}%`,minHeight:m.ch?3:0}}/>
                <div style={{flex:1,background:"#1a6b3a",borderRadius:"3px 3px 0 0",height:`${(m.pa/mx)*100}%`,minHeight:m.pa?3:0}}/>
              </div>
              <span style={{fontSize:"0.6rem",color:"#8a9e91",fontWeight:700}}>{m.m}</span>
            </div>
          ))}
        </div>
        <div style={{...FL,gap:"1.3rem",marginTop:"0.7rem",fontSize:"0.74rem"}}>
          <div style={{...FL,gap:5}}><div style={{width:13,height:10,background:"#f5c5c2",borderRadius:3}}/> Levied</div>
          <div style={{...FL,gap:5}}><div style={{width:13,height:10,background:"#1a6b3a",borderRadius:3}}/> Collected</div>
        </div>
      </div>
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",overflow:"auto",marginBottom:"1.1rem"}}>
        <div style={{padding:"0.75rem 1rem",borderBottom:"1px solid #e2ece4",fontWeight:800,color:"#0f2417",fontSize:"0.86rem"}}>Monthly Breakdown — {yr}</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.79rem",minWidth:400}}>
          <thead><tr style={{background:"#f4f8f5"}}>{["Month","Levied","Collected","Deficit","Rate"].map(h=><th key={h} style={{padding:"0.48rem 0.88rem",textAlign:h==="Month"?"left":"right",color:"#4a6352",fontWeight:800,fontSize:"0.69rem",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{mo.map(m=>{const r=m.ch>0?Math.round((m.pa/m.ch)*100):null;return(
            <tr key={m.m} style={{borderBottom:"1px solid #eef3ef"}}>
              <td style={{padding:"0.48rem 0.88rem",fontWeight:700}}>{m.m} {yr}</td>
              <td style={{padding:"0.48rem 0.88rem",textAlign:"right",color:"#c0392b",fontVariantNumeric:"tabular-nums"}}>{m.ch?`KES ${fmt(m.ch)}`:"-"}</td>
              <td style={{padding:"0.48rem 0.88rem",textAlign:"right",color:"#1a6b3a",fontVariantNumeric:"tabular-nums"}}>{m.pa?`KES ${fmt(m.pa)}`:"-"}</td>
              <td style={{padding:"0.48rem 0.88rem",textAlign:"right",color:m.diff>0?"#c0392b":m.diff<0?"#2471a3":"#1a6b3a",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{(m.ch||m.pa)?`KES ${fmt(Math.abs(m.diff))}${m.diff>0?" short":m.diff<0?" ahead":""}`:"-"}</td>
              <td style={{padding:"0.48rem 0.88rem",textAlign:"right"}}>{r!=null?<BDG c={r>=100?"#1a6b3a":r>=70?"#e67e22":"#c0392b"} bg={r>=100?"#eaf5ed":r>=70?"#fef4e8":"#fff1f0"}>{r}%</BDG>:"-"}</td>
            </tr>
          );})}
          <tr style={{background:"#f4f8f5",fontWeight:900}}>
            <td style={{padding:"0.58rem 0.88rem"}}>TOTAL</td>
            <td style={{padding:"0.58rem 0.88rem",textAlign:"right",color:"#c0392b",fontVariantNumeric:"tabular-nums"}}>KES {fmt(tCh)}</td>
            <td style={{padding:"0.58rem 0.88rem",textAlign:"right",color:"#1a6b3a",fontVariantNumeric:"tabular-nums"}}>KES {fmt(tPa)}</td>
            <td style={{padding:"0.58rem 0.88rem",textAlign:"right",color:"#c0392b",fontVariantNumeric:"tabular-nums"}}>KES {fmt(tCh-tPa)}</td>
            <td style={{padding:"0.58rem 0.88rem",textAlign:"right"}}><BDG c={rate>=90?"#1a6b3a":rate>=70?"#e67e22":"#c0392b"} bg={rate>=90?"#eaf5ed":rate>=70?"#fef4e8":"#fff1f0"}>{rate}%</BDG></td>
          </tr>
          </tbody>
        </table>
      </div>
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",overflow:"auto"}}>
        <div style={{padding:"0.75rem 1rem",borderBottom:"1px solid #e2ece4",fontWeight:800,color:"#0f2417",fontSize:"0.86rem"}}>Resident Payment Summary</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.79rem",minWidth:380}}>
          <thead><tr style={{background:"#f4f8f5"}}>{["Resident","Unit","Total Paid","Balance"].map(h=><th key={h} style={{padding:"0.48rem 0.88rem",textAlign:h==="Total Paid"||h==="Balance"?"right":"left",color:"#4a6352",fontWeight:800,fontSize:"0.69rem",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{bals.sort((a,b)=>b.bal-a.bal).map(r=>(
            <tr key={r.id} style={{borderBottom:"1px solid #eef3ef"}}>
              <td style={{padding:"0.48rem 0.88rem",fontWeight:700}}>{r.name}</td>
              <td style={{padding:"0.48rem 0.88rem",color:"#6b7f72"}}>{r.unit}</td>
              <td style={{padding:"0.48rem 0.88rem",textAlign:"right",color:"#1a6b3a",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>KES {fmt(r.paid)}</td>
              <td style={{padding:"0.48rem 0.88rem",textAlign:"right"}}>{r.bal>0?<BDG c="#c0392b" bg="#fff1f0">KES {fmt(r.bal)} owed</BDG>:r.bal<0?<BDG c="#2471a3" bg="#eaf3fb">KES {fmt(Math.abs(r.bal))} credit</BDG>:<BDG c="#1a6b3a" bg="#eaf5ed">✓</BDG>}</td>
            </tr>
          ))}
          <tr style={{background:"#f4f8f5",fontWeight:900}}>
            <td colSpan={2} style={{padding:"0.58rem 0.88rem"}}>Totals</td>
            <td style={{padding:"0.58rem 0.88rem",textAlign:"right",color:"#1a6b3a",fontVariantNumeric:"tabular-nums"}}>KES {fmt(bals.reduce((s,r)=>s+r.paid,0))}</td>
            <td style={{padding:"0.58rem 0.88rem",textAlign:"right"}}><BDG c="#c0392b" bg="#fff1f0">KES {fmt(bals.filter(r=>r.bal>0).reduce((s,r)=>s+r.bal,0))} outstanding</BDG></td>
          </tr>
          </tbody>
        </table>
      </div>
      <div style={{background:"#fff",border:"1px solid #e2ece4",borderRadius:12,overflow:"hidden",marginTop:"1.1rem"}}>
        <div style={{...FL,justifyContent:"space-between",gap:"0.7rem",flexWrap:"wrap",padding:"0.75rem 1rem",borderBottom:"1px solid #e2ece4"}}>
          <span style={{fontWeight:800,color:"#0f2417",fontSize:"0.86rem"}}>Provider payments · {yr}</span>
          <BTN v="sec" sz="sm" onClick={exportProviderReport}>⇩ Export Provider CSV</BTN>
        </div>
        <div style={{padding:"0.7rem 1rem",fontSize:"0.76rem",color:"#6b7f72",lineHeight:1.55}}>
          Contracted cost: <b>KES {fmt(provider.monthlyCharge)}/month</b> · Payments recorded in {yr}: <b>KES {fmt(providerYearTotal)}</b> · Invoices: none recorded · Outstanding payable: not calculable without invoices. Payments are not externally verified by this app.
        </div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.76rem",minWidth:700}}>
          <thead><tr style={{background:"#f4f8f5"}}>{["Date","Billing period","Amount","Method","Reference","Status / recorder"].map((h,i)=><th key={h} style={{padding:"0.45rem 0.7rem",textAlign:i===2?"right":"left",color:"#4a6352",fontSize:"0.67rem",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{providerYearPayments.length===0?<tr><td colSpan={6} style={{padding:"1.1rem",textAlign:"center",color:"#8a9e91"}}>No Provider payments recorded for {yr}.</td></tr>:providerYearPayments.map(item=><tr key={item.id} style={{borderTop:"1px solid #eef3ef"}}>
            <td style={{padding:"0.45rem 0.7rem"}}>{item.date}</td><td style={{padding:"0.45rem 0.7rem"}}>{item.billingPeriod||"—"}</td>
            <td style={{padding:"0.45rem 0.7rem",textAlign:"right",fontWeight:800}}>KES {fmt(item.amount)}</td><td style={{padding:"0.45rem 0.7rem"}}>{item.method}</td>
            <td style={{padding:"0.45rem 0.7rem"}}>{item.reference||"—"}</td><td style={{padding:"0.45rem 0.7rem"}}>{item.status||"recorded"} · {item.recordedBy?.name||item.recordedBy||"unknown"}</td>
          </tr>)}</tbody>
        </table></div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// RESIDENT VIEW (read-only, for residents)
// ══════════════════════════════════════════════════════════════
function ResidentView({ residents, transactions, provider, onBack, authMode, residentId }) {
  const [unit, setUnit] = useState(residentId || "");
  const [showPay, setShowPay] = useState(false);
  const selectedResidentId = authMode === "signed-in" ? residentId : unit;
  const resident = residents.find(r => r.id === selectedResidentId) || null;
  const paybill = provider.paybill || PAYBILL;

  if (authMode !== "offline" && !(authMode === "signed-in" && residentId && resident)) return (
    <div style={{background:"#fff8ec",border:"1px solid #f0d5a8",borderRadius:12,padding:"1.25rem",maxWidth:620,margin:"1rem auto",color:"#80530e",lineHeight:1.65}}>
      <h2 style={{margin:"0 0 0.5rem",fontSize:"1.05rem",color:"#68430b"}}>Resident access is not configured</h2>
      <p style={{margin:"0 0 1rem",fontSize:"0.85rem"}}>This account is connected to shared estate data. A unit selector is not authentication, so resident statements are unavailable here until resident accounts and server-side unit access are implemented.</p>
      <BTN v="sec" onClick={onBack}><Ico n="back" sz={14}/> Back to Admin</BTN>
    </div>
  );

  if (!resident) return (
    <div>
      <div style={{...FL,justifyContent:"space-between",marginBottom:"1.5rem",flexWrap:"wrap",gap:"0.7rem"}}>
        <div>
          <h2 style={{margin:0,fontSize:"1.35rem",fontWeight:900,color:"#0f2417"}}>🏡 Lemayian Court</h2>
          <p style={{margin:"0.25rem 0 0",color:"#6b7f72",fontSize:"0.86rem"}}>Resident portal — read-only statement</p>
        </div>
        <BTN v="gho" onClick={onBack}><Ico n="back" sz={14}/> Back to Admin</BTN>
      </div>
      <div style={{background:"#fff",borderRadius:14,border:"1px solid #e2ece4",padding:"2rem",maxWidth:480,margin:"0 auto"}}>
        <div style={{fontSize:"2.5rem",textAlign:"center",marginBottom:"0.8rem"}}>👤</div>
        <h3 style={{margin:"0 0 1.2rem",fontSize:"1.05rem",fontWeight:900,color:"#0f2417",textAlign:"center"}}>Select your unit</h3>
        <FLD label="Your unit"><SEL value={unit} onChange={e => setUnit(e.target.value)}>
          <option value="">-- Select your unit --</option>
          {residents.map(r => <option key={r.id} value={r.id}>{r.name} · Unit {r.unit}</option>)}
        </SEL></FLD>
        <div role="note" style={{background:"#fff8ec",border:"1px solid #f0d5a8",borderRadius:9,padding:"0.7rem 0.8rem",fontSize:"0.75rem",color:"#80530e",lineHeight:1.55,marginBottom:"0.8rem"}}>
          Local demonstration only. This unit selector is not authentication and must not be used to expose resident accounts on a public deployment.
        </div>
        <div style={{background:"#f4f8f5",borderRadius:9,padding:"0.8rem 0.9rem",fontSize:"0.8rem",color:"#4a6352",lineHeight:1.6}}>
          <b>Need to pay?</b> Use M-Pesa Paybill <b>{paybill}</b> and enter your unit number as the account.
        </div>
      </div>
    </div>
  );

  const myT = [...transactions].filter(t => t.residentId === resident.id);
  const rows = runningBalance(myT);
  const bal = rows.length ? rows[rows.length-1].run : 0;

  return (
    <div>
      <div style={{...FL,justifyContent:"space-between",marginBottom:"1.3rem",flexWrap:"wrap",gap:"0.7rem"}}>
        <div>
          <h2 style={{margin:0,fontSize:"1.3rem",fontWeight:900,color:"#0f2417"}}>🏡 Lemayian Court</h2>
          <p style={{margin:"0.22rem 0 0",color:"#6b7f72",fontSize:"0.83rem"}}>Resident portal · {resident.name} · Unit {resident.unit}</p>
        </div>
        {authMode === "offline" && <div style={{...FL,gap:"0.5rem",flexWrap:"wrap"}}>
          <BTN v="gho" sz="sm" onClick={() => setUnit("")}>Change unit</BTN>
          <BTN v="gho" onClick={onBack}><Ico n="back" sz={14}/> Back to Admin</BTN>
        </div>}
      </div>

      <div style={{background:"#fff",borderRadius:14,border:"1px solid #e2ece4",padding:"1.35rem 1.5rem",marginBottom:"1rem",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"1rem"}}>
        <div>
          <div style={{fontSize:"0.72rem",color:"#6b7f72",textTransform:"uppercase",fontWeight:800,letterSpacing:"0.055em",marginBottom:"0.35rem"}}>Your balance</div>
          <div style={{fontWeight:900,fontSize:"1.75rem",fontVariantNumeric:"tabular-nums",color:bal>0?"#c0392b":bal<0?"#2471a3":"#1a6b3a"}}>
            {bal>0?`KES ${fmt(bal)} owed`:bal<0?`KES ${fmt(Math.abs(bal))} credit`:"✓ Fully settled"}
          </div>
          <div style={{fontSize:"0.78rem",color:"#8a9e91",marginTop:"0.25rem"}}>{bal>0?"Please settle by end of month.":bal<0?"You have a credit on your account.":"Nothing outstanding — thank you!"}</div>
        </div>
        <BTN sz="lg" onClick={() => setShowPay(true)}><Ico n="card" sz={16}/> Pay Now</BTN>
      </div>
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",overflow:"hidden",marginBottom:"1rem"}}>
        <div style={{padding:"0.8rem 1.1rem",borderBottom:"1px solid #e2ece4",fontWeight:800,color:"#0f2417",fontSize:"0.88rem"}}>Your Statement</div>
        <div style={{overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.82rem",minWidth:460}}>
            <thead><tr style={{background:"#f4f8f5"}}>{["Date","Description","Charge","Payment","Adjustment","Balance"].map((h,i)=><th key={h} style={{padding:"0.55rem 0.9rem",textAlign:i>=2?"right":"left",color:"#4a6352",fontWeight:800,fontSize:"0.69rem",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.length===0 && <tr><td colSpan={6} style={{textAlign:"center",padding:"2.5rem",color:"#8a9e91",fontStyle:"italic"}}>No transactions yet</td></tr>}
              {[...rows].reverse().map(t => (
                <tr key={t.id} style={{borderBottom:"1px solid #eef3ef"}}>
                  <td style={{padding:"0.5rem 0.9rem",color:"#4a6352",whiteSpace:"nowrap"}}>{t.date}</td>
                  <td style={{padding:"0.5rem 0.9rem",color:"#0f2417"}}>{t.note}</td>
                  <td style={{padding:"0.5rem 0.9rem",textAlign:"right",color:"#c0392b",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{t.type==="charge"?`KES ${fmt(t.amount)}`:""}</td>
                  <td style={{padding:"0.5rem 0.9rem",textAlign:"right",color:"#1a6b3a",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{t.type==="payment"?`KES ${fmt(t.amount)}`:""}</td>
                  <td style={{padding:"0.5rem 0.9rem",textAlign:"right",color:t.balanceEffect<0?"#c0392b":"#2471a3",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{t.type==="reversal"?`KES ${fmt(t.balanceEffect)}`:""}</td>
                  <td style={{padding:"0.5rem 0.9rem",textAlign:"right",fontWeight:800,fontVariantNumeric:"tabular-nums",color:t.run>0?"#c0392b":t.run<0?"#2471a3":"#1a6b3a"}}>KES {fmt(Math.abs(t.run))}{t.run<0?" Cr":""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",padding:"1.15rem 1.25rem"}}>
        <h3 style={{margin:"0 0 0.85rem",fontSize:"0.9rem",fontWeight:800,color:"#0f2417"}}>Estate contacts</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:"0.65rem"}}>
          {[["Security Provider",provider.name,"S"],["Contact Person",provider.contactPerson,"C"],["Provider Mobile",provider.mobile,"M"],["Hotline",provider.hotline,"H"],["M-Pesa Paybill",provider.paybill,"P"]].map(([k,v,em]) => (
            <div key={k} style={{background:"#f4f8f5",borderRadius:9,padding:"0.7rem 0.85rem"}}>
              <div style={{fontSize:"0.67rem",color:"#6b7f72",textTransform:"uppercase",fontWeight:800,letterSpacing:"0.05em",marginBottom:"0.2rem"}}>{k}</div>
              <div style={{fontWeight:800,fontSize:"0.9rem",color:"#0f2417",fontVariantNumeric:"tabular-nums"}}>{v || "—"}</div>
            </div>
          ))}
        </div>
        <div style={{fontSize:"0.74rem",color:"#8a9e91",marginTop:"0.8rem",lineHeight:1.6}}>
          Monthly levy: KES {fmt(MONTHLY_TOTAL)} (Security KES {fmt(MONTHLY_SECURITY)} + Others KES {fmt(MONTHLY_OTHERS)}), due by the 25th.
        </div>
      </div>

      {showPay && <Modal title="Pay by M-Pesa" onClose={() => setShowPay(false)} w={440}>
        <div style={{textAlign:"center",marginBottom:"1.1rem"}}>
          <div style={{fontSize:"2.4rem",marginBottom:"0.4rem"}}>M-PESA</div>
          <div style={{fontSize:"0.8rem",color:"#6b7f72"}}>Paybill Number</div>
          <div style={{fontSize:"2.1rem",fontWeight:900,color:"#1a6b3a",fontVariantNumeric:"tabular-nums",letterSpacing:"0.04em"}}>{paybill}</div>
          <div style={{fontSize:"0.78rem",color:"#6b7f72",marginTop:"0.2rem"}}>Account number: <b>{resident.unit}</b></div>
        </div>
        <div style={{background:"#eaf5ed",borderRadius:10,padding:"0.95rem 1.05rem",marginBottom:"1rem"}}>
          <div style={{fontWeight:900,color:"#1a6b3a",fontSize:"0.85rem",marginBottom:"0.55rem"}}>How to pay</div>
          <ol style={{margin:0,paddingLeft:"1.15rem",color:"#0f2417",fontSize:"0.83rem",lineHeight:1.85}}>
            <li>Go to <b>M-Pesa</b> then <b>Lipa na M-Pesa</b> then <b>Pay Bill</b></li>
            <li>Enter Business Number <b>{paybill}</b></li>
            <li>Enter Account Number <b>{resident.unit}</b> (your unit)</li>
            <li>Enter the amount and your M-Pesa PIN</li>
            <li>Keep the confirmation SMS for your records</li>
          </ol>
        </div>
        <div style={{background:"#f4f8f5",borderRadius:9,padding:"0.7rem 0.85rem",fontSize:"0.82rem",color:"#4a6352",marginBottom:"1rem",lineHeight:1.6}}>
          {bal>0?<>Amount due now: <b style={{color:"#c0392b"}}>KES {fmt(bal)}</b></>:bal<0?<>You have a credit of <b style={{color:"#2471a3"}}>KES {fmt(Math.abs(bal))}</b> — the next KES {fmt(MONTHLY_TOTAL)} levy is already partly covered.</>:<>Monthly levy: <b>KES {fmt(MONTHLY_TOTAL)}</b></>}
        </div>
        <BTN onClick={() => setShowPay(false)} style={{width:"100%",justifyContent:"center"}}>Done</BTN>
      </Modal>}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
// PROVIDER
// ══════════════════════════════════════════════════════════════
function Provider({ provider, setProvider, payments, setPayments, authMode, authToken, authUser, toast }) {
  const [fm, setFm] = useState(provider);
  useEffect(() => setFm(provider), [provider]);
  const [waState, setWaState] = useState({});
  const [paymentForm, setPaymentForm] = useState(() => ({date:today(),amount:"",method:"M-Pesa",reference:"",billingPeriod:"",notes:"",idempotencyKey:uid()}));
  const [paymentBusy, setPaymentBusy] = useState(false);
  const canManage = authMode === "offline" || ["owner","manager","accountant"].includes(authUser?.role);
  const paymentTotal = payments.reduce((sum,item) => sum + (Number(item.amount) || 0),0);
  const fields = [
    {k:"name",          l:"Provider Name"},
    {k:"contactPerson", l:"Contact Person"},
    {k:"mobile",        l:"Mobile"},
    {k:"hotline",       l:"Hotline"},
    {k:"paybill",       l:"M-Pesa Paybill"},
  ];
  const save = () => {
    const monthlyCharge = Number(fm.monthlyCharge);
    if (!canManage) { toast("Your role cannot edit provider details","error"); return; }
    if (!String(fm.name || "").trim() || !Number.isSafeInteger(monthlyCharge) || monthlyCharge <= 0) { toast("Enter a provider name and a positive whole-KES monthly charge","error"); return; }
    setProvider({ ...fm, monthlyCharge, paybill: String(fm.paybill || "").trim() });
    toast("Provider details saved");
  };
  const recordPayment = async () => {
    const amount = Number(paymentForm.amount);
    if (!canManage) { toast("Your role cannot record provider payments","error"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentForm.date) || !Number.isSafeInteger(amount) || amount <= 0) { toast("Enter a valid payment date and positive whole-KES amount","error"); return; }
    if (paymentForm.billingPeriod && !/^\d{4}-(0[1-9]|1[0-2])$/.test(paymentForm.billingPeriod)) { toast("Billing period must use YYYY-MM","error"); return; }
    if (paymentForm.reference && payments.some(item => item.reference === paymentForm.reference.trim())) { toast("A provider payment with this reference is already recorded","error"); return; }
    const payload = {...paymentForm,amount,reference:paymentForm.reference.trim(),notes:paymentForm.notes.trim()};
    setPaymentBusy(true);
    try {
      let payment;
      if (authMode === "signed-in") {
        const result = await apiRequest("/provider-payments",{method:"POST",body:JSON.stringify(payload)},authToken);
        payment = result.payment;
      } else {
        payment = {...payload,id:uid(),status:"recorded",verification:"not independently verified",recordedAt:new Date().toISOString(),recordedBy:authUser?.name || "Local offline user"};
      }
      setPayments(current => [payment,...current.filter(item=>item.id!==payment.id)]);
      setPaymentForm({date:today(),amount:"",method:"M-Pesa",reference:"",billingPeriod:"",notes:"",idempotencyKey:uid()});
      toast("Provider payment recorded; external payment not verified");
    } catch (error) { toast(error.message || "Could not save provider payment","error"); }
    finally { setPaymentBusy(false); }
  };
  const dirty = JSON.stringify(fm) !== JSON.stringify(provider);
  return (
    <div>
      <div style={{...FL,justifyContent:"space-between",marginBottom:"1.35rem",flexWrap:"wrap",gap:"0.7rem"}}>
        <div><h2 style={{margin:0,fontSize:"1.3rem",fontWeight:900,color:"#0f2417"}}>Security Provider</h2><p style={{margin:"0.2rem 0 0",color:"#6b7f72",fontSize:"0.84rem"}}>Contracted security firm and payment details</p></div>
        <div style={{...FL,gap:"0.5rem"}}>
          {canManage && dirty && <BTN v="sec" sz="sm" onClick={() => setFm(provider)}>Discard</BTN>}
          {canManage && <BTN onClick={save} disabled={!dirty}><Ico n="check" sz={14}/> Save Changes</BTN>}
        </div>
      </div>

      <div style={{background:"#0d1f13",borderRadius:12,padding:"1.25rem 1.35rem",marginBottom:"1rem",color:"#fff"}}>
        <div style={{...FL,gap:"0.7rem",marginBottom:"0.85rem"}}>
          <div style={{width:38,height:38,borderRadius:10,background:"rgba(106,170,122,0.2)",display:"flex",alignItems:"center",justifyContent:"center",color:"#7dca8c",flexShrink:0}}><Ico n="shield" sz={19}/></div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:900,fontSize:"1.02rem"}}>{provider.name || "—"}</div>
            <div style={{fontSize:"0.74rem",color:"#6aaa7a"}}>Security provider · Contact: {provider.contactPerson || "—"}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:"0.66rem",color:"#6aaa7a",textTransform:"uppercase",fontWeight:800,letterSpacing:"0.06em"}}>Monthly Charge</div>
            <div style={{fontWeight:900,fontSize:"1.05rem",fontVariantNumeric:"tabular-nums"}}>KES {fmt(provider.monthlyCharge)}</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"0.6rem"}}>
          {[["Mobile",provider.mobile],["Hotline",provider.hotline],["M-Pesa Paybill",provider.paybill]].map(([k,v]) => (
            <div key={k} style={{background:"rgba(255,255,255,0.06)",borderRadius:9,padding:"0.6rem 0.8rem"}}>
              <div style={{fontSize:"0.65rem",color:"#6aaa7a",textTransform:"uppercase",fontWeight:800,letterSpacing:"0.05em",marginBottom:"0.2rem"}}>{k}</div>
              <div style={{fontWeight:800,fontSize:"0.88rem",fontVariantNumeric:"tabular-nums"}}>{v || "—"}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",padding:"1.25rem"}}>
        <h3 style={{margin:"0 0 1rem",fontSize:"0.95rem",color:"#0f2417"}}>Provider details</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:"0 0.85rem"}}>
          {fields.map(f => <FLD key={f.k} label={f.l}><INP disabled={!canManage} value={fm[f.k] || ""} onChange={e => setFm(p => ({...p,[f.k]:e.target.value}))}/></FLD>)}
          <FLD label="Monthly Charge (KES)"><INP disabled={!canManage} type="number" step="1" min="1" value={fm.monthlyCharge} onChange={e => setFm(p => ({...p,monthlyCharge:e.target.value}))}/></FLD>
        </div>
        <FLD label="Notes"><TXA disabled={!canManage} rows={4} value={fm.notes || ""} onChange={e => setFm(p => ({...p,notes:e.target.value}))} placeholder="Contract terms, renewal dates, guard shifts, incidents…"/></FLD>
        <div style={{...FL,gap:"0.55rem",flexWrap:"wrap"}}>
          <BTN v="sec" sz="sm" onClick={() => { setWaState("msg"); }}>
            <Ico n="warn" sz={13}/> Quick message to {provider.contactPerson || "contact"}
          </BTN>
        </div>
      </div>

      <section style={{background:"#fff",border:"1px solid #e2ece4",borderRadius:12,padding:"1.2rem",marginTop:"1rem"}}>
        <h3 style={{margin:"0 0 0.8rem",fontSize:"0.95rem",color:"#0f2417"}}>Provider payment history</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:"0.7rem",marginBottom:"1rem"}}>
          {[["Contracted monthly cost",`KES ${fmt(provider.monthlyCharge)}`],["Payments recorded",`KES ${fmt(paymentTotal)}`],["Invoices","No invoices recorded"],["Outstanding payable","Not calculable without invoices"]].map(([label,value])=><div key={label} style={{background:"#f4f8f5",borderRadius:8,padding:"0.7rem 0.8rem"}}><div style={{fontSize:"0.67rem",color:"#6b7f72",fontWeight:800,textTransform:"uppercase",marginBottom:"0.25rem"}}>{label}</div><div style={{fontSize:"0.83rem",fontWeight:800,color:"#0f2417"}}>{value}</div></div>)}
        </div>
        <p style={{margin:"0 0 1rem",fontSize:"0.76rem",color:"#6b7f72",lineHeight:1.5}}>A recorded payment is not proof that the provider received it. No invoice records or external payment verification are available.</p>
        {canManage && <div style={{borderTop:"1px solid #e2ece4",paddingTop:"1rem",marginBottom:"1rem"}}>
          <h4 style={{margin:"0 0 0.75rem",fontSize:"0.84rem",color:"#0f2417"}}>Record provider payment</h4>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:"0 0.7rem"}}>
            <FLD label="Payment date"><INP type="date" value={paymentForm.date} onChange={e=>setPaymentForm(p=>({...p,date:e.target.value}))}/></FLD>
            <FLD label="Amount (KES)"><INP type="number" min="1" step="1" value={paymentForm.amount} onChange={e=>setPaymentForm(p=>({...p,amount:e.target.value}))}/></FLD>
            <FLD label="Method"><SEL value={paymentForm.method} onChange={e=>setPaymentForm(p=>({...p,method:e.target.value}))}>{["M-Pesa","Bank Transfer","Cash","Cheque","Other"].map(method=><option key={method}>{method}</option>)}</SEL></FLD>
            <FLD label="Billing period (optional)"><INP type="month" value={paymentForm.billingPeriod} onChange={e=>setPaymentForm(p=>({...p,billingPeriod:e.target.value}))}/></FLD>
            <FLD label="Payment reference"><INP value={paymentForm.reference} onChange={e=>setPaymentForm(p=>({...p,reference:e.target.value}))}/></FLD>
            <FLD label="Notes"><INP value={paymentForm.notes} onChange={e=>setPaymentForm(p=>({...p,notes:e.target.value}))}/></FLD>
          </div>
          <BTN disabled={paymentBusy} onClick={recordPayment}><Ico n="check" sz={14}/>{paymentBusy?" Recording…":" Record Payment"}</BTN>
        </div>}
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.76rem",minWidth:680}}>
          <thead><tr style={{background:"#f4f8f5"}}>{["Payment date","Billing period","Amount","Method","Reference","Status / recorded by"].map((heading,index)=><th key={heading} style={{padding:"0.45rem 0.65rem",textAlign:index===2?"right":"left",color:"#4a6352",fontSize:"0.67rem",textTransform:"uppercase"}}>{heading}</th>)}</tr></thead>
          <tbody>{payments.length===0?<tr><td colSpan={6} style={{padding:"1.2rem",textAlign:"center",color:"#8a9e91"}}>No provider payments recorded.</td></tr>:payments.map(item=><tr key={item.id} style={{borderTop:"1px solid #eef3ef"}}>
            <td style={{padding:"0.5rem 0.65rem",whiteSpace:"nowrap"}}>{item.date}</td><td style={{padding:"0.5rem 0.65rem"}}>{item.billingPeriod||"—"}</td>
            <td style={{padding:"0.5rem 0.65rem",textAlign:"right",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>KES {fmt(item.amount)}</td>
            <td style={{padding:"0.5rem 0.65rem"}}>{item.method}</td><td style={{padding:"0.5rem 0.65rem"}}>{item.reference||"—"}</td>
            <td style={{padding:"0.5rem 0.65rem"}}>{item.status||"recorded"}; unverified<div style={{fontSize:"0.68rem",color:"#8a9e91"}}>By {item.recordedBy?.name||item.recordedBy||"unknown"}</div></td>
          </tr>)}</tbody>
        </table></div>
      </section>

      {waState === "msg" && <Modal title={`Message ${provider.contactPerson || provider.name}`} onClose={() => setWaState("")} w={440}>
        <p style={{margin:"0 0 0.85rem",color:"#4a6352",fontSize:"0.85rem",lineHeight:1.6}}>
          Opens WhatsApp with the provider's contact person on <b>{provider.mobile || "—"}</b>.
        </p>
        <div style={{background:"#f4f8f5",borderRadius:9,padding:"0.8rem 0.9rem",fontSize:"0.83rem",color:"#0f2417",lineHeight:1.6,marginBottom:"1rem"}}>
          Dear {provider.contactPerson || "team"}, this is the Lemayian Court estate committee regarding {provider.name || "the security contract"}.
        </div>
        <div style={{...FL,justifyContent:"flex-end",gap:"0.6rem"}}>
          <BTN v="sec" onClick={() => setWaState("")}>Cancel</BTN>
          <BTN disabled={!normaliseKenyanPhone(provider.mobile)} title={!normaliseKenyanPhone(provider.mobile) ? "No valid Kenyan mobile number on file" : undefined} onClick={() => { const link = waLink(provider.mobile, `Dear ${provider.contactPerson || "team"}, this is the Lemayian Court estate committee regarding ${provider.name || "the security contract"}.`); if (link) window.open(link, "_blank", "noopener"); setWaState(""); }}>
            💬 Open WhatsApp
          </BTN>
        </div>
      </Modal>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════
// ── Reminder schedule helpers ──────────────────────────────────
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const daysUntil = iso => Math.max(0, Math.round((new Date(`${iso}T00:00:00`) - new Date(new Date().toDateString())) / 86400000));
function reminderSchedule(from = new Date()) {
  const year = from.getFullYear();
  const month = from.getMonth();
  const todayISO = isoOf(from);
  const levyISO = isoOf(new Date(year, month, 25));
  const eomISO = isoOf(new Date(year, month + 1, 0));
  const upcoming = [{type:"levy",iso:levyISO},{type:"overdue",iso:eomISO}]
    .filter(item => item.iso >= todayISO)
    .sort((a,b) => a.iso.localeCompare(b.iso));
  const nextUp = upcoming[0] || {type:"levy",iso:isoOf(new Date(year, month + 1, 25))};
  return {levyISO,eomISO,nextUp};
}
function dayLabel(iso) {
  const n = new Date(`${iso}T00:00:00`).getDate();
  const s = (n % 10 === 1 && n !== 11) ? "st" : (n % 10 === 2 && n !== 12) ? "nd" : (n % 10 === 3 && n !== 13) ? "rd" : "th";
  return `${n}${s} ${MONTHS[new Date(`${iso}T00:00:00`).getMonth()]}`;
}
function Reminders({ residents, reminders, setReminders, transactions, toast }) {
  const [add, setAdd] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [fm, setFm] = useState({residentId:"",date:today(),method:"WhatsApp",note:"",sentBy:"Estate Manager"});
  const [bFm, setBFm] = useState({type:"levy",date:today(),method:"WhatsApp"});
  const {confirm, dialog} = useConfirm();

  const bals = residents.map(r => ({...r, bal: calcBal(r.id, transactions)}));
  const debtors = bals.filter(r => r.bal > 0);
  const now = new Date();
  const thisMonth = MONTHS[now.getMonth()];
  const {levyISO,eomISO,nextUp} = reminderSchedule(now);
  const scheduleISO = type => type === "levy" ? levyISO : eomISO;
  const scheduleKey = type => `${type}-${scheduleISO(type).slice(0,7)}`;
  const away = daysUntil(nextUp.iso);

  const markSent = async type => {
    const targets = type === "levy" ? residents : debtors;
    if (!targets.length) { toast("No residents to remind","error"); return; }
    const key = scheduleKey(type);
    if (reminders.some(item => item.scheduleKey === key)) { toast("This schedule has already been logged"); return; }
    if (!await confirm(`Mark the ${REMINDER_TYPES[type].label} as sent to ${targets.length} resident${targets.length!==1?"s":""}?\n\nThis logs one entry per resident in the reminder log.`)) return;
    const month = MONTHS[new Date(`${scheduleISO(type)}T00:00:00`).getMonth()];
    setReminders(p => [...p, ...targets.map(r => ({id:uid(), residentId:r.id, date:today(), method:"WhatsApp", sentBy:"Estate Manager", kind:type, scheduleKey:key, status:"manually-marked-sent", deliveryStatus:"unverified", note: reminderMessage(type, r.name, r.bal, month)}))]);
    toast(`${REMINDER_TYPES[type].label} logged for ${targets.length} resident${targets.length!==1?"s":""}`);
  };

  const sendBulk = async () => {
    const eligible = bFm.type === "levy" ? residents : debtors;
    const targets = eligible.filter(r => selectedRecipients.includes(r.id));
    if (!targets.length) { toast("No residents match this reminder","error"); return; }
    if (!await confirm(`Send the ${REMINDER_TYPES[bFm.type].label} to ${targets.length} resident${targets.length!==1?"s":""} by ${bFm.method}?\n\nOne reminder log entry will be created per resident.`)) return;
    const month = MONTHS[new Date(`${bFm.date}T00:00:00`).getMonth()];
    const additions = targets.filter(r => !reminders.some(item => item.bulkKey === `${bFm.type}-${bFm.date}-${r.id}`));
    if (!additions.length) { toast("These reminders have already been logged"); setBulk(false); return; }
    setReminders(p => [...p, ...additions.map(r => ({id:uid(), residentId:r.id, date:bFm.date, method:bFm.method, sentBy:"Estate Manager", kind:bFm.type, bulkKey:`${bFm.type}-${bFm.date}-${r.id}`, status:"prepared", deliveryStatus:"unverified", note: reminderMessage(bFm.type, r.name, r.bal, month)}))]);
    toast(`Bulk reminder logged for ${additions.length} resident${additions.length!==1?"s":""}; delivery is not verified`);
    setBulk(false);
  };

  const openBulk = () => {
    const type = "levy";
    setBFm({type,date:today(),method:"WhatsApp"});
    setSelectedRecipients(residents.map(r => r.id));
    setBulk(true);
  };

  const schedCard = type => {
    const t = REMINDER_TYPES[type];
    const targets = type === "levy" ? residents : debtors;
    const sent = reminders.some(item => item.scheduleKey === scheduleKey(type));
    return (
      <div key={type} style={{background:"#fff",border:`1px solid ${type==="levy"?"#e2ece4":"#f5c5c2"}`,borderRadius:12,padding:"1rem 1.15rem"}}>
        <div style={{...FL,justifyContent:"space-between",gap:"0.6rem",marginBottom:"0.55rem",flexWrap:"wrap"}}>
          <div style={{...FL,gap:"0.5rem"}}>
            <div style={{width:32,height:32,borderRadius:9,background:type==="levy"?"#eaf5ed":"#fff1f0",color:type==="levy"?"#1a6b3a":"#c0392b",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Ico n={type==="levy"?"warn":"x"} sz={16}/></div>
            <div>
              <div style={{fontWeight:900,color:"#0f2417",fontSize:"0.9rem"}}>{dayLabel(scheduleISO(type))} — {t.subject}</div>
              <div style={{fontSize:"0.73rem",color:"#6b7f72"}}>{t.label} · sent to {t.audience}</div>
            </div>
          </div>
          {sent ? <BDG c="#8a5a12" bg="#fff8ec">Logged · delivery unverified</BDG> : <BTN sz="sm" onClick={() => markSent(type)}>Log as Sent</BTN>}
        </div>
        <div style={{fontSize:"0.76rem",color:"#4a6352",background:"#f4f8f5",borderRadius:8,padding:"0.55rem 0.75rem",lineHeight:1.55}}>
          <b>{targets.length}</b> recipient{targets.length!==1?"s":""} · {type === "levy" ? `KES ${fmt(MONTHLY_TOTAL)} due by the 25th` : `${debtors.length} with a balance`}
        </div>
      </div>
    );
  };

  const save = () => {
    if (!fm.residentId) { toast("Select a resident","error"); return; }
    if (!fm.note.trim()) { toast("Add a reminder note","error"); return; }
    setReminders(p => [...p, {id:uid(),...fm}]);
    toast("Reminder logged"); setFm({residentId:"",date:today(),method:"WhatsApp",note:"",sentBy:"Estate Manager"}); setAdd(false);
  };
  const remove = async id => { if (!await confirm("Delete this reminder?\n\nThis cannot be undone.")) return; setReminders(p => p.filter(item => item.id !== id)); toast("Reminder deleted","warn"); };
  const sorted = [...reminders].sort((a,b) => b.date.localeCompare(a.date));
  return <div>
    <div style={{...FL,justifyContent:"space-between",marginBottom:"1.35rem",flexWrap:"wrap",gap:"0.7rem"}}>
      <div><h2 style={{margin:0,fontSize:"1.3rem",fontWeight:900,color:"#0f2417"}}>Reminders</h2><p style={{margin:"0.2rem 0 0",color:"#6b7f72",fontSize:"0.84rem"}}>Scheduled levy reminders and arrears follow-up trail</p></div>
      <div style={{...FL,gap:"0.5rem",flexWrap:"wrap"}}>
        <BTN v="sec" onClick={() => setAdd(true)}>🔔 Log Reminder</BTN>
        <BTN onClick={openBulk}>📣 Send Bulk Reminder</BTN>
      </div>
    </div>

    <div style={{background:"#0d1f13",borderRadius:12,padding:"0.9rem 1.15rem",marginBottom:"1rem",color:"#fff",...FL,justifyContent:"space-between",flexWrap:"wrap",gap:"0.6rem"}}>
      <div style={{...FL,gap:"0.6rem"}}>
        <span style={{fontSize:"1.1rem"}}>⏰</span>
        <div>
          <div style={{fontWeight:900,fontSize:"0.88rem"}}>Next reminder: {dayLabel(nextUp.iso)}</div>
          <div style={{fontSize:"0.72rem",color:"#6aaa7a"}}>{REMINDER_TYPES[nextUp.type].subject} · {REMINDER_TYPES[nextUp.type].audience}</div>
        </div>
      </div>
      <BDG c="#7dca8c" bg="rgba(106,170,122,0.18)">{away} day{away!==1?"s":""} away</BDG>
    </div>

    <h3 style={{margin:"0 0 0.7rem",fontSize:"0.88rem",fontWeight:800,color:"#0f2417"}}>This Month's Schedule — {thisMonth}</h3>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:"0.8rem",marginBottom:"1.35rem"}}>
      {["levy","overdue"].map(schedCard)}
    </div>

    <h3 style={{margin:"0 0 0.7rem",fontSize:"0.88rem",fontWeight:800,color:"#0f2417"}}>Residents — Payment Status</h3>
    <div style={{display:"grid",gap:"0.65rem",marginBottom:"1.35rem"}}>
      {bals.map(r => (
        <div key={r.id} style={{background:"#fff",border:"1px solid #e2ece4",borderRadius:12,padding:"0.85rem 1.15rem",...FL,gap:"0.9rem",flexWrap:"wrap"}}>
          <div style={{width:36,height:36,borderRadius:"50%",background:`hsl(${(r.name.charCodeAt(0)*17)%360},42%,87%)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:"#0f2417",flexShrink:0}}>{r.name[0].toUpperCase()}</div>
          <div style={{flex:1,minWidth:150}}>
            <div style={{fontWeight:800,color:"#0f2417",fontSize:"0.88rem"}}>{r.name} <span style={{color:"#8a9e91",fontWeight:400,fontSize:"0.75rem"}}>· {r.unit}</span></div>
            <div style={{fontSize:"0.75rem",color:"#6b7f72"}}>{r.phone || "No phone on file"}</div>
          </div>
          <div>{r.bal>0?<BDG c="#c0392b" bg="#fff1f0">KES {fmt(r.bal)} owed</BDG>:r.bal<0?<BDG c="#2471a3" bg="#eaf3fb">KES {fmt(Math.abs(r.bal))} credit</BDG>:<BDG c="#1a6b3a" bg="#eaf5ed">✓ Settled</BDG>}</div>
          <BTN v="gho" sz="sm" onClick={() => { const link = waLink(r.phone, reminderMessage("levy", r.name, r.bal, thisMonth)); if (link) window.open(link, "_blank", "noopener"); }} disabled={!normaliseKenyanPhone(r.phone)} title={!normaliseKenyanPhone(r.phone) ? "No valid Kenyan mobile number on file" : "Opens WhatsApp with a prepared message; delivery is not confirmed"}>💬 WhatsApp</BTN>
        </div>
      ))}
    </div>

    <h3 style={{margin:"0 0 0.7rem",fontSize:"0.88rem",fontWeight:800,color:"#0f2417"}}>Reminder Log</h3>
    <div style={{display:"grid",gap:"0.65rem"}}>{sorted.map(item => { const resident=residents.find(r => r.id===item.residentId); return <div key={item.id} style={{background:"#fff",border:"1px solid #e2ece4",borderRadius:12,padding:"0.85rem 1.15rem",...FL,gap:"0.85rem",flexWrap:"wrap"}}><div style={{fontSize:"1.15rem"}}>{item.method==="Call"?"📞":item.method==="SMS"?"📱":item.method==="Email"?"📧":"💬"}</div><div style={{flex:1,minWidth:180}}><div style={{fontWeight:800,color:"#0f2417",fontSize:"0.85rem"}}>{resident?.name || "Unknown resident"} <BDG>{item.method}</BDG> {item.kind && <BDG c="#2471a3" bg="#eaf3fb">{REMINDER_TYPES[item.kind]?.label || item.kind}</BDG>} <span style={{fontSize:"0.73rem",color:"#8a9e91",fontWeight:400}}>{item.date}</span></div><div style={{fontSize:"0.8rem",color:"#4a6352",marginTop:2}}>{item.note}</div><div style={{fontSize:"0.71rem",color:"#8a9e91",marginTop:2}}>{item.status === "manually-marked-sent" ? "Manually marked sent; delivery not verified" : item.status === "prepared" ? "Prepared/logged; delivery not verified" : `Sent by: ${item.sentBy}`}</div></div><BTN v="dan" sz="sm" onClick={() => remove(item.id)}><Ico n="trash" sz={12}/></BTN></div>; })}</div>
    {sorted.length===0 && <div style={{textAlign:"center",padding:"3rem",color:"#8a9e91",background:"#fff",borderRadius:12,border:"1px solid #e2ece4"}}>No reminders logged yet.</div>}
    {add && <Modal title="Log Reminder" onClose={() => setAdd(false)}><FLD label="Resident"><SEL value={fm.residentId} onChange={e=>setFm(p=>({...p,residentId:e.target.value}))}><option value="">-- Select resident --</option>{residents.map(r=><option key={r.id} value={r.id}>{r.name} ({r.unit})</option>)}</SEL></FLD><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.7rem"}}><FLD label="Date"><INP type="date" value={fm.date} onChange={e=>setFm(p=>({...p,date:e.target.value}))}/></FLD><FLD label="Method"><SEL value={fm.method} onChange={e=>setFm(p=>({...p,method:e.target.value}))}>{["WhatsApp","Call","SMS","Email","Letter","Visit"].map(method=><option key={method}>{method}</option>)}</SEL></FLD></div><FLD label="Note"><TXA value={fm.note} onChange={e=>setFm(p=>({...p,note:e.target.value}))} placeholder="What was communicated?" rows={3}/></FLD><FLD label="Sent by"><INP value={fm.sentBy} onChange={e=>setFm(p=>({...p,sentBy:e.target.value}))}/></FLD><div style={{...FL,justifyContent:"flex-end",gap:"0.65rem"}}><BTN v="sec" onClick={() => setAdd(false)}>Cancel</BTN><BTN onClick={save}>Log Reminder</BTN></div></Modal>}
    {bulk && <Modal title="Send Bulk Reminder" onClose={() => setBulk(false)} w={520}>
      <FLD label="Reminder type"><SEL value={bFm.type} onChange={e=>{ const type=e.target.value; setBFm(p=>({...p,type})); setSelectedRecipients((type==="levy"?residents:debtors).map(r=>r.id)); }}>
        <option value="levy">25th reminder — Monthly levy due (ALL residents)</option>
        <option value="overdue">End-of-month reminder — Payment overdue (balance &gt; 0)</option>
      </SEL></FLD>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.7rem"}}>
        <FLD label="Date"><INP type="date" value={bFm.date} onChange={e=>setBFm(p=>({...p,date:e.target.value}))}/></FLD>
        <FLD label="Method"><SEL value={bFm.method} onChange={e=>setBFm(p=>({...p,method:e.target.value}))}>{["WhatsApp","SMS","Call"].map(m=><option key={m}>{m}</option>)}</SEL></FLD>
      </div>
      <FLD label="Message preview">
        <div style={{background:"#f4f8f5",borderRadius:9,padding:"0.8rem 0.9rem",fontSize:"0.82rem",color:"#0f2417",lineHeight:1.65,maxHeight:150,overflow:"auto"}}>
          {reminderMessage(bFm.type, residents[0]?.name || "[Name]", Math.max(debtors[0]?.bal || 0, MONTHLY_TOTAL), MONTHS[new Date(`${bFm.date}T00:00:00`).getMonth()])}
        </div>
      </FLD>
      <FLD label="Recipients" hint="WhatsApp, SMS, and calls are not sent automatically by this app.">
        <div style={{maxHeight:150,overflowY:"auto",border:"1px solid #e2ece4",borderRadius:8,padding:"0.35rem 0.65rem"}}>
          {(bFm.type === "levy" ? residents : debtors).map(r => <label key={r.id} style={{display:"flex",alignItems:"center",gap:"0.55rem",padding:"0.35rem 0",fontSize:"0.82rem",color:"#0f2417"}}>
            <input type="checkbox" checked={selectedRecipients.includes(r.id)} onChange={e=>setSelectedRecipients(p=>e.target.checked?[...p,r.id]:p.filter(id=>id!==r.id))}/>
            {r.name} · {r.unit}{bFm.type === "overdue" ? ` · KES ${fmt(r.bal)} owed` : ""}
          </label>)}
          {(bFm.type === "levy" ? residents : debtors).length===0 && <div style={{padding:"0.65rem 0",fontSize:"0.82rem",color:"#8a9e91"}}>No eligible residents.</div>}
        </div>
      </FLD>
      <div style={{background:"#eaf5ed",borderRadius:9,padding:"0.65rem 0.9rem",fontSize:"0.82rem",fontWeight:800,color:"#1a6b3a",marginBottom:"1rem"}}>
        Will log {selectedRecipients.filter(id => (bFm.type === "levy" ? residents : debtors).some(r=>r.id===id)).length} reminder{selectedRecipients.length!==1?"s":""} — one per selected resident
      </div>
      <div style={{...FL,justifyContent:"flex-end",gap:"0.65rem"}}><BTN v="sec" onClick={() => setBulk(false)}>Cancel</BTN><BTN onClick={sendBulk}><Ico n="check" sz={13}/> Confirm &amp; Log</BTN></div>
    </Modal>}
    {dialog}
  </div>;
}

function Settings({ residents, setResidents, transactions, setTransactions, projects, setProjects, contribs, setContribs, reminders, setReminders, provider, setProvider, providerPayments, setProviderPayments, toast }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const {confirm, dialog} = useConfirm();
  const backup = () => {
    const data = {version:4, exported:new Date().toISOString(), residents, transactions, projects, contribs, reminders, provider, providerPayments};
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:"application/json"}));
    link.download = `lemayian-court-backup-${today()}.json`;
    link.click();
    toast("Backup downloaded");
  };
  const restore = event => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!isValidBackup(data)) throw new Error("Invalid backup");
        if (!await confirm(`Restore backup from ${data.exported?.slice(0,10) || "unknown date"}?\n\nThis replaces all current data.`)) return;
        setResidents(data.residents);
        setTransactions(data.transactions);
        setProjects(Array.isArray(data.projects) ? data.projects : []);
        setContribs(Array.isArray(data.contribs) ? data.contribs : []);
        setReminders(Array.isArray(data.reminders) ? data.reminders : []);
        if (data.provider && typeof data.provider === "object" && !Array.isArray(data.provider)) setProvider(data.provider);
        setProviderPayments(Array.isArray(data.providerPayments) ? data.providerPayments : []);
        toast("Backup restored successfully");
      } catch { toast("Invalid backup file", "error"); }
    };
    reader.readAsText(file);
    event.target.value = "";
  };
  const reset = () => {
    setResidents(SEED_RESIDENTS);
    setTransactions(buildSeedTxns());
    setProjects(SEED_PROJECTS);
    setContribs(SEED_CONTRIBS);
    setReminders(SEED_REMINDERS);
    setProvider(SEED_PROVIDER);
    setProviderPayments([]);
    setConfirmReset(false);
    toast("Data reset to demo data", "warn");
  };
  return (
    <div>
      <h2 style={{margin:"0 0 0.3rem",fontSize:"1.3rem",fontWeight:900,color:"#0f2417"}}>Settings</h2>
      <p style={{margin:"0 0 1.4rem",color:"#6b7f72",fontSize:"0.84rem"}}>Backup, restore, and manage estate data</p>
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",padding:"1.25rem",marginBottom:"1rem"}}>
        <h3 style={{margin:"0 0 0.45rem",fontSize:"0.95rem",color:"#0f2417"}}>Backup and restore</h3>
        <p style={{margin:"0 0 1rem",color:"#4a6352",fontSize:"0.85rem",lineHeight:1.6}}>Download all estate data as JSON, or restore a previous backup on this computer.</p>
        <div style={{display:"flex",gap:"0.7rem",flexWrap:"wrap"}}>
          <BTN onClick={backup}>⇩ Download backup</BTN>
          <label style={{display:"inline-flex"}}><BTN v="sec" as="span">⇧ Restore backup</BTN><input type="file" accept=".json,application/json" onChange={restore} style={{display:"none"}}/></label>
        </div>
      </div>
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2ece4",padding:"1.25rem"}}>
        <h3 style={{margin:"0 0 0.45rem",fontSize:"0.95rem",color:"#0f2417"}}>Demo data</h3>
        <p style={{margin:"0 0 1rem",color:"#4a6352",fontSize:"0.85rem",lineHeight:1.6}}>Restore the original eight residents, PDF transactions, and seeded project contributions before a presentation.</p>
        {!confirmReset ? <BTN v="warn" onClick={() => setConfirmReset(true)}>Reset to demo data</BTN> : <div style={{display:"flex",alignItems:"center",gap:"0.7rem",flexWrap:"wrap",background:"#fff8ec",padding:"0.8rem",borderRadius:8}}><strong style={{fontSize:"0.82rem",color:"#d35400"}}>Replace all current data?</strong><BTN v="dan" sz="sm" onClick={reset}>Yes, reset</BTN><BTN v="sec" sz="sm" onClick={() => setConfirmReset(false)}>Cancel</BTN></div>}
      </div>
      {dialog}
    </div>
  );
}

function AuthScreen({onAuthenticated, onOffline}) {
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [estateName, setEstateName] = useState("Lemayian Court");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const data = await apiRequest(register ? "/auth/register" : "/auth/login", {method:"POST",body:JSON.stringify({name,estateName,email,password})});
      onAuthenticated(data);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <div style={{minHeight:"100vh",background:"#0d1f13",display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
      <form onSubmit={submit} style={{background:"#fff",borderRadius:16,width:"100%",maxWidth:420,padding:"2rem",boxShadow:"0 24px 60px rgba(0,0,0,0.25)"}}>
        <div style={{fontSize:"2rem",marginBottom:"0.5rem"}}>🏡</div>
        <h1 style={{margin:"0 0 0.35rem",fontSize:"1.35rem",color:"#0f2417"}}>{register ? "Create estate account" : "Welcome back"}</h1>
        <p style={{margin:"0 0 1.3rem",color:"#6b7f72",fontSize:"0.84rem",lineHeight:1.5}}>{register ? "Create a secure workspace for your estate team." : "Sign in to sync estate records across managers and devices."}</p>
        {register && <><FLD label="Your name"><INP value={name} onChange={e=>setName(e.target.value)} required autoFocus placeholder="Estate manager"/></FLD><FLD label="Estate name"><INP value={estateName} onChange={e=>setEstateName(e.target.value)} required/></FLD></>}
        <FLD label="Email"><INP type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoFocus={!register} placeholder="manager@example.com"/></FLD>
        <FLD label="Password" hint="At least 8 characters"><INP type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8}/></FLD>
        {error && <div role="alert" style={{background:"#fff1f0",color:"#c0392b",padding:"0.65rem 0.8rem",borderRadius:8,fontSize:"0.82rem",marginBottom:"1rem"}}>{error}</div>}
        <BTN type="submit" disabled={busy} style={{width:"100%",justifyContent:"center"}}>{busy ? "Working…" : register ? "Create account" : "Sign in"}</BTN>
        <button type="button" onClick={()=>{setRegister(p=>!p);setError("");}} style={{display:"block",width:"100%",marginTop:"0.9rem",border:0,background:"none",color:"#1a6b3a",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>{register ? "Already have an account? Sign in" : "Create a new account"}</button>
        <button type="button" onClick={onOffline} style={{display:"block",width:"100%",marginTop:"0.8rem",border:0,background:"none",color:"#8a9e91",cursor:"pointer",fontFamily:"inherit",fontSize:"0.78rem"}}>Continue with offline demo data</button>
      </form>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════
const NAV = [
  {id:"dashboard",l:"Dashboard",n:"home"},
  {id:"residents",l:"Residents",n:"people"},
  {id:"payments", l:"Payments", n:"card"},
  {id:"projects", l:"Projects", n:"layers"},
  {id:"provider", l:"Provider", n:"shield"},
  {id:"reminders",l:"Reminders",n:"warn"},
  {id:"reports",  l:"Reports",  n:"bar"},
  {id:"settings", l:"Settings", n:"file"},
];

export default function App() {
  const [page, setPage]         = useState("dashboard");
  const [residents, setResidents] = useState([]);
  const [txns, setTxns]         = useState([]);
  const [projects, setProjects]   = useState([]);
  const [contribs, setContribs]   = useState([]);
  const [reminders, setReminders] = useState([]);
  const [provider, setProvider] = useState(SEED_PROVIDER);
  const [providerPayments, setProviderPayments] = useState([]);
  const [residentMode, setResidentMode] = useState(false);
  const [loaded, setLoaded]     = useState(false);
  const [tourStep, setTourStep]   = useState(null);
  const [authMode, setAuthMode] = useState("checking");
  const [authToken, setAuthToken] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const { toasts, remove, toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    const token = sg(AUTH_KEY, null);
    if (!token) { setAuthMode("signed-out"); return; }
    apiRequest("/me", {}, token).then(result => {
      setAuthToken(token); setAuthUser(result.user); setResidentMode(result.user.role === "resident"); setResidents(result.data.residents); setTxns(result.data.transactions); setProjects(result.data.projects); setContribs(result.data.contribs); setReminders(result.data.reminders || []); setProvider(result.data.provider || sg(PROVIDER_KEY, SEED_PROVIDER)); setProviderPayments(result.data.providerPayments || []); setLoaded(true); setAuthMode("signed-in");
    }).catch(async () => {
      const refreshToken = sg(REFRESH_KEY, null);
      if (!refreshToken) throw new Error("No refresh token");
      const next = await apiRequest("/auth/refresh", {method:"POST",body:JSON.stringify({refreshToken})});
      ss(AUTH_KEY, next.accessToken); ss(REFRESH_KEY, next.refreshToken);
      return apiRequest("/me", {}, next.accessToken).then(result => { setAuthToken(next.accessToken); setAuthUser(result.user); setResidentMode(result.user.role === "resident"); setResidents(result.data.residents); setTxns(result.data.transactions); setProjects(result.data.projects); setContribs(result.data.contribs); setReminders(result.data.reminders || []); setProvider(result.data.provider || sg(PROVIDER_KEY, SEED_PROVIDER)); setProviderPayments(result.data.providerPayments || []); setLoaded(true); setAuthMode("signed-in"); });
    }).catch(() => { ss(AUTH_KEY, null); ss(REFRESH_KEY, null); setAuthMode("signed-out"); });
  }, []);

  useEffect(() => {
    if (authMode !== "signed-in") return undefined;
    const timer = setInterval(async () => {
      try {
        const refreshToken = sg(REFRESH_KEY, null);
        if (!refreshToken) return;
        const next = await apiRequest("/auth/refresh", {method:"POST",body:JSON.stringify({refreshToken})});
        ss(AUTH_KEY, next.accessToken); ss(REFRESH_KEY, next.refreshToken); setAuthToken(next.accessToken);
      } catch { toastRef.current("Session refresh failed; please sign in again", "error"); }
    }, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [authMode]);

  useEffect(() => { if (loaded && authMode === "offline") ss(KEYS.r, residents); }, [residents, loaded, authMode]);
  useEffect(() => { if (loaded && authMode === "offline") ss(KEYS.t, txns); }, [txns, loaded, authMode]);
  useEffect(() => { if (loaded && authMode === "offline") ss(KEYS.p, projects); }, [projects, loaded, authMode]);
  useEffect(() => { if (loaded && authMode === "offline") ss(KEYS.c, contribs); }, [contribs, loaded, authMode]);
  useEffect(() => { if (loaded && authMode === "offline") ss(KEYS.rem, reminders); }, [reminders, loaded, authMode]);
  useEffect(() => { if (loaded && authMode === "offline") ss(PROVIDER_PAYMENTS_KEY, providerPayments); }, [providerPayments, loaded, authMode]);
  useEffect(() => { if (loaded) ss(PROVIDER_KEY, provider); }, [provider, loaded]);
  useEffect(() => {
    if (!loaded || authMode !== "signed-in" || !["owner","manager","accountant"].includes(authUser?.role)) return;
    const timer = setTimeout(() => apiRequest("/data", {method:"PUT",body:JSON.stringify({residents,transactions:txns,projects,contribs,reminders,provider})}, authToken).catch(() => toast("Cloud sync failed", "error")), 350);
    return () => clearTimeout(timer);
  }, [residents, txns, projects, contribs, reminders, provider, loaded, authMode, authToken, authUser?.role, toast]);

  const authenticated = data => {
    ss(AUTH_KEY, data.accessToken || data.token); ss(REFRESH_KEY, data.refreshToken || null); setAuthToken(data.accessToken || data.token); setAuthUser(data.user);
    const source = data.data;
    setResidentMode(data.user.role === "resident");
    setResidents(source.residents); setTxns(source.transactions); setProjects(source.projects); setContribs(source.contribs); setReminders(source.reminders || []); setProvider(source.provider || sg(PROVIDER_KEY, SEED_PROVIDER)); setProviderPayments(source.providerPayments || []); setLoaded(true); setAuthMode("signed-in");
  };
  const offline = () => {
    try {
      const migrated = migrateLegacyStorage(localStorage);
      if (migrated) toast(`Recovered ${migrated} data set${migrated===1?"":"s"} from an older version`);
    } catch (error) { toast(`Offline data migration stopped: ${error.message}`, "error"); return; }
    ss(AUTH_KEY, null); ss(REFRESH_KEY, null); setResidents(sg(KEYS.r, null) ?? SEED_RESIDENTS); setTxns(sg(KEYS.t, null) ?? buildSeedTxns()); setProjects(sg(KEYS.p, null) ?? SEED_PROJECTS); setContribs(sg(KEYS.c, null) ?? SEED_CONTRIBS); setReminders(sg(KEYS.rem, null) ?? SEED_REMINDERS); setProvider(sg(PROVIDER_KEY, null) ?? SEED_PROVIDER); setProviderPayments(sg(PROVIDER_PAYMENTS_KEY, null) ?? []); setLoaded(true); setAuthMode("offline"); if (!sg(KEYS.tour, false)) setTourStep(0);
  };
  const logout = () => { ss(AUTH_KEY, null); ss(REFRESH_KEY, null); setAuthToken(null); setAuthUser(null); setLoaded(false); setResidentMode(false); setTourStep(null); setAuthMode("signed-out"); };

  const tourNext = () => {
    const nx = tourStep + 1;
    if (nx >= TOUR.length) { setTourStep(null); setResidentMode(false); ss(KEYS.tour, true); return; }
    const target = TOUR[nx].page;
    if (target === "residentview") { setResidentMode(true); } else { setResidentMode(false); setPage(target); }
    setTourStep(nx);
  };
  const tourSkip = () => { setTourStep(null); setResidentMode(false); ss(KEYS.tour, true); };

  if (authMode === "checking") return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f0f5f1",fontFamily:"system-ui"}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:"2.5rem",marginBottom:"0.75rem"}}>🏡</div><div style={{color:"#4a6352",fontWeight:700}}>Loading…</div></div>
    </div>
  );
  if (authMode === "signed-out") return <AuthScreen onAuthenticated={authenticated} onOffline={offline}/>;
  if (!loaded) return <div style={{padding:"2rem",fontFamily:"system-ui"}}>Loading…</div>;
  const residentAccount = authMode === "signed-in" && authUser?.role === "resident";
  const readOnlyUser = authMode === "signed-in" && authUser?.role === "viewer";
  const visibleNav = readOnlyUser ? NAV.filter(item=>["dashboard","reports","provider"].includes(item.id)) : NAV;
  const visiblePage = readOnlyUser && !["dashboard","reports","provider"].includes(page) ? "dashboard" : page;

  return (
    <div className="app-shell" style={{fontFamily:"'Inter',system-ui,sans-serif",background:"#f0f5f1",minHeight:"100vh",display:"flex"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        @keyframes slideIn { from{opacity:0;transform:translateX(16px)} to{opacity:1;transform:translateX(0)} }
        input:focus, select:focus { border-color: #1a6b3a !important; box-shadow: 0 0 0 3px rgba(26,107,58,0.12); }
        button:active { transform: scale(0.97); }
        tr:hover td { background: rgba(26,107,58,0.025); }
        @media print {
          body { background: #fff; }
          .no-print { display: none !important; }
          table { font-size: 11px; }
        }
        @media (max-width: 720px) {
          .app-shell { display: block !important; }
          .app-sidebar { width: 100% !important; height: auto !important; min-height: 0 !important; position: static !important; }
          .app-sidebar nav { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 0.5rem !important; }
          .app-sidebar nav button { justify-content: center; margin: 0 !important; padding: 0.55rem 0.25rem !important; font-size: 0.72rem !important; }
          .app-sidebar > div:first-child { padding: 0.8rem 1rem !important; }
          .app-sidebar > div:last-child { display: flex !important; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem !important; }
          .app-sidebar > div:last-child > button { display: block; flex: 1; min-width: 0; width: auto !important; margin-top: 0 !important; text-align: center !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .app-sidebar > div:last-child > div { display: none; }
          .app-main main { padding: 1rem !important; }
          .app-main > div:first-child { position: static !important; }
        }
      `}</style>

      {/* Sidebar — hidden in Resident View */}
      {!residentMode && !residentAccount && <div className="app-sidebar no-print" style={{width:216,background:"#0d1f13",flexShrink:0,display:"flex",flexDirection:"column",minHeight:"100vh",position:"sticky",top:0,height:"100vh"}}>
        <div style={{padding:"1.35rem 1.2rem 0.9rem",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
          <div style={{fontWeight:900,fontSize:"0.94rem",color:"#fff",lineHeight:1.2}}>🏡 Lemayian Court</div>
          <div style={{fontSize:"0.67rem",color:"#6aaa7a",marginTop:"0.22rem",textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:800}}>Estate Manager</div>
        </div>
        <nav style={{flex:1,padding:"0.7rem 0.62rem",overflowY:"auto"}}>
          {visibleNav.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:"0.58rem",padding:"0.58rem 0.72rem",border:"none",borderRadius:9,cursor:"pointer",background:page===n.id?"rgba(106,170,122,0.17)":"transparent",color:page===n.id?"#7dca8c":"rgba(255,255,255,0.52)",fontSize:"0.83rem",fontWeight:page===n.id?800:500,marginBottom:"0.1rem",textAlign:"left",borderLeft:page===n.id?"3px solid #6aaa7a":"3px solid transparent",fontFamily:"inherit"}}>
              <Ico n={n.n} sz={15}/>{n.l}{n.id==="reminders" && residents.some(r => calcBal(r.id,txns)>0) && <span style={{marginLeft:"auto",background:"#c0392b",color:"#fff",borderRadius:99,padding:"1px 6px",fontSize:"0.65rem",fontWeight:900}}>{residents.filter(r => calcBal(r.id,txns)>0).length}</span>}
            </button>
          ))}
        </nav>
        <div style={{padding:"0.9rem 1.2rem",borderTop:"1px solid rgba(255,255,255,0.07)"}}>
          {!readOnlyUser && <button onClick={() => { setTourStep(0); setPage(TOUR[0].page); }} style={{background:"rgba(106,170,122,0.13)",border:"1px solid rgba(106,170,122,0.28)",borderRadius:8,color:"#6aaa7a",fontSize:"0.74rem",fontWeight:800,padding:"0.42rem 0.72rem",cursor:"pointer",width:"100%",textAlign:"left",fontFamily:"inherit"}}>🎓 App Tour</button>}
          {authMode === "signed-in" ? <button onClick={logout} style={{marginTop:"0.55rem",background:"transparent",border:"1px solid rgba(255,255,255,0.14)",borderRadius:8,color:"rgba(255,255,255,0.62)",fontSize:"0.7rem",padding:"0.4rem 0.72rem",cursor:"pointer",width:"100%",textAlign:"left",fontFamily:"inherit"}}>Sign out{authUser?.email ? ` · ${authUser.email}` : ""}</button> : <div style={{fontSize:"0.68rem",color:"#d9b35c",marginTop:"0.6rem"}}>Offline demo mode</div>}
          <div style={{fontSize:"0.63rem",color:"rgba(255,255,255,0.2)",marginTop:"0.65rem",textAlign:"center"}}>© 2025 Lemayian Court</div>
        </div>
      </div>}

      {/* Main content */}
      <div className="app-main" style={{flex:1,minWidth:0,display:"flex",flexDirection:"column"}}>
        <div style={{background:"#fff",borderBottom:"1px solid #e2ece4",padding:"0.7rem 1.4rem",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
          <div style={{fontWeight:800,color:"#0f2417",fontSize:"0.91rem"}}>{residentAccount ? "Resident Account" : residentMode ? "Resident View" : NAV.find(n=>n.id===visiblePage)?.l}</div>
          <div style={{...FL,gap:"0.7rem"}}>
            <div style={{fontSize:"0.77rem",color:"#8a9e91"}}>{new Date().toLocaleDateString("en-KE",{weekday:"short",year:"numeric",month:"short",day:"numeric"})}</div>
            {residentAccount
              ? <BTN v="sec" sz="sm" onClick={logout}>Sign out</BTN>
              : residentMode
              ? <BTN v="sec" sz="sm" onClick={() => setResidentMode(false)}><Ico n="back" sz={13}/> Back to Admin</BTN>
              : !readOnlyUser ? <BTN v="sec" sz="sm" onClick={() => { setResidentMode(true); setTourStep(null); }}><Ico n="user" sz={13}/> Resident View 👤</BTN> : null}
          </div>
        </div>
        <main style={{flex:1,padding:"1.4rem",maxWidth:920,width:"100%"}}>
              {residentAccount || residentMode
            ? <ResidentView residents={residents} transactions={txns} provider={provider} authMode={authMode} residentId={residentAccount ? authUser.residentId : undefined} onBack={() => setResidentMode(false)}/>
            : <>
                {visiblePage==="dashboard" && <Dashboard residents={residents} transactions={txns} setPage={setPage} provider={provider} canManage={!readOnlyUser}/>}
              {visiblePage==="residents" && <Residents residents={residents} setResidents={setResidents} transactions={txns} setTransactions={setTxns} contribs={contribs} setContribs={setContribs} authMode={authMode} authToken={authToken} authUser={authUser} toast={toast}/>}
              {visiblePage==="payments"  && <Payments  residents={residents} transactions={txns} setTransactions={setTxns} toast={toast}/>}
              {visiblePage==="projects"  && <Projects  projects={projects} setProjects={setProjects} contribs={contribs} setContribs={setContribs} residents={residents} toast={toast}/>}
              {visiblePage==="reminders" && <Reminders residents={residents} reminders={reminders} setReminders={setReminders} transactions={txns} toast={toast}/>}
              {visiblePage==="reports"   && <Reports residents={residents} transactions={txns} provider={provider} providerPayments={providerPayments}/>}
              {visiblePage==="provider"  && <Provider provider={provider} setProvider={setProvider} payments={providerPayments} setPayments={setProviderPayments} authMode={authMode} authToken={authToken} authUser={authUser} toast={toast}/>}
              {visiblePage==="settings"  && <Settings residents={residents} setResidents={setResidents} transactions={txns} setTransactions={setTxns} projects={projects} setProjects={setProjects} contribs={contribs} setContribs={setContribs} reminders={reminders} setReminders={setReminders} provider={provider} setProvider={setProvider} providerPayments={providerPayments} setProviderPayments={setProviderPayments} toast={toast}/>}
              </>}
        </main>
      </div>

      <Toasts toasts={toasts} remove={remove}/>
      {tourStep !== null && <Tour step={tourStep} onNext={tourNext} onSkip={tourSkip}/>}
    </div>
  );
}

export { buildSeedTxns, calcBal, hasDuplicateCharge, isValidBackup, removeResidentData, reconcile,
         runningBalance, workbookYearBreaks, affectsBalance, SEED_CONTRIBS, SEED_REMINDERS, WORKBOOK_GATEHOUSE_ITEMS, WORKBOOK_PAYMENT_REFERENCES,
         WORKBOOK_CLOSING, WORKBOOK_OPENING_2026, REQUESTED_OPENING_2026, WORKBOOK_GATEHOUSE, normaliseKenyanPhone, waLink, migrateLegacyStorage, reminderSchedule };

