import { useState, useEffect, useRef } from "react";

const fmt = n => Number(n).toLocaleString("en-KE", { minimumFractionDigits:2, maximumFractionDigits:2 });
const today = () => new Date().toISOString().slice(0,10);
const uid = () => `id_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
const MONTHLY_SECURITY = 3750, MONTHLY_OTHERS = 250, MONTHLY_TOTAL = 4000;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const KEYS = { r:"lc-r3", t:"lc-t3", p:"lc-p3", c:"lc-c3", rem:"lc-rem3", tour:"lc-tour3" };
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

const SEED_RESIDENTS = [
  {id:"r1",name:"Hon. Ndetei",unit:"A1",phone:""},
  {id:"r2",name:"Esther Gicimu",unit:"A2",phone:""},
  {id:"r3",name:"Njoroge",unit:"A3",phone:""},
  {id:"r4",name:"Magomere",unit:"A4",phone:""},
  {id:"r5",name:"Karanja",unit:"A5",phone:""},
  {id:"r6",name:"Muriuki",unit:"A6",phone:""},
  {id:"r7",name:"Mbindu",unit:"A7",phone:""},
  {id:"r8",name:"Mwanthi",unit:"A8",phone:""},
];

function buildSeedTxns() {
  let n=1; const T=[];
  const ch=(rid,date)=>({id:`t${n++}`,residentId:rid,date,type:"charge",amount:MONTHLY_TOTAL,security:MONTHLY_SECURITY,others:MONTHLY_OTHERS,note:"Monthly levy"});
  const py=(rid,date,amount,note="Payment")=>({id:`t${n++}`,residentId:rid,date,type:"payment",amount,security:0,others:0,note});
  ["2025-01-25","2025-02-25","2025-03-25","2025-04-24","2025-05-25","2025-06-25","2025-07-27","2025-08-25","2025-09-25","2025-10-25","2025-11-25","2025-12-25"].forEach(d=>T.push(ch("r1",d)));
  [["2025-04-25",16000],["2025-07-28",8000],["2025-09-15",8000],["2025-11-24",4000],["2025-12-16",8000]].forEach(([d,a])=>T.push(py("r1",d,a)));
  ["2025-01-26","2025-02-25","2025-03-25","2025-04-24","2025-05-25","2025-06-25","2025-07-27","2025-08-25","2025-09-25","2025-10-25","2025-11-25","2025-12-25"].forEach(d=>T.push(ch("r2",d)));
  [["2025-01-18",12000],["2025-03-01",4000],["2025-04-08",12000],["2025-07-30",12000],["2025-10-29",8000]].forEach(([d,a])=>T.push(py("r2",d,a)));
  ["2025-01-25","2025-02-25","2025-03-25","2025-04-24","2025-05-25","2025-06-25","2025-07-27","2025-08-25","2025-09-25","2025-10-25","2025-11-25","2025-12-25"].forEach(d=>T.push(ch("r3",d)));
  [["2025-01-28",8000],["2025-03-05",4000],["2025-03-30",8000],["2025-06-26",8000],["2025-10-29",16000]].forEach(([d,a])=>T.push(py("r3",d,a)));
  ["2025-01-25","2025-02-25","2025-03-25","2025-04-24","2025-05-25","2025-06-25","2025-07-27","2025-08-25","2025-09-25","2025-10-25","2025-11-25","2025-12-25"].forEach(d=>T.push(ch("r4",d)));
  [["2025-01-28",8000],["2025-03-31",8000],["2025-04-24",8000],["2025-07-22",4000],["2025-10-29",16000]].forEach(([d,a])=>T.push(py("r4",d,a)));
  T.push({id:`t${n++}`,residentId:"r5",date:"2025-01-01",type:"openingBalance",amount:12000,security:0,others:0,note:"Opening balance b/fwd"});
  ["2025-01-25","2025-02-25","2025-03-25","2025-04-24","2025-05-25","2025-06-25","2025-07-27","2025-08-25","2025-09-25","2025-10-25","2025-11-25","2025-12-25"].forEach(d=>T.push(ch("r5",d)));
  [["2025-02-11",4000],["2025-04-14",4000],["2025-06-03",4000],["2025-07-13",4000],["2025-09-10",4000],["2025-11-17",4000],["2025-12-12",4000]].forEach(([d,a])=>T.push(py("r5",d,a)));
  ["2025-01-25","2025-02-25","2025-03-25","2025-04-24","2025-05-25","2025-06-25","2025-07-27","2025-08-25","2025-09-25","2025-10-25","2025-11-25","2025-12-25"].forEach(d=>T.push(ch("r6",d)));
  ["2025-01-25","2025-02-25","2025-03-25","2025-04-24","2025-05-25","2025-06-25","2025-07-27","2025-08-25","2025-09-25","2025-10-25","2025-11-25","2025-12-25"].forEach(d=>T.push(py("r6",d,4000)));
  ["2025-01-25","2025-02-25","2025-03-25","2025-04-24","2025-05-25","2025-06-25","2025-07-27","2025-08-25","2025-09-25","2025-10-25","2025-11-25","2025-12-25"].forEach(d=>T.push(ch("r7",d)));
  [["2025-02-06",12000],["2025-04-24",12000],["2025-08-03",12000],["2025-10-29",12000]].forEach(([d,a])=>T.push(py("r7",d,a)));
  ["2025-01-25","2025-02-25","2025-03-25","2025-04-24","2025-05-25","2025-06-25","2025-07-27","2025-08-25","2025-09-25","2025-10-25","2025-11-25","2025-12-25"].forEach(d=>T.push(ch("r8",d)));
  [["2025-02-27",4000],["2025-03-28",4000],["2025-04-25",4000],["2025-05-14",4000],["2025-06-27",4000],["2025-08-03",4000],["2025-09-19",12000],["2025-10-29",4000],["2025-11-20",4000]].forEach(([d,a])=>T.push(py("r8",d,a)));
  const r1Refs = ["QKJ3A1BX2R","QKL9M3PX7T","QKM2N4RY8U","QKN5P6SZ9V","QKP8Q7TA1W"];
  T.filter(t => t.residentId === "r1" && t.type === "payment").forEach((t,i) => { t.mpesa = r1Refs[i]; });
  const r2Refs = ["QKA1B2C3D4","QKE5F6G7H8","QKI9J0K1L2","QKM3N4O5P6","QKQ7R8S9T0"];
  T.filter(t => t.residentId === "r2" && t.type === "payment").forEach((t,i) => { t.mpesa = r2Refs[i]; });
  return T;
}

const SEED_PROJECTS = [
  {id:"p1",name:"GateHouse – 1st Estimate",target:400000,notes:"Main gatehouse construction"},
  {id:"p2",name:"GateHouse – Additional Works",target:80000,notes:"Extra works beyond initial estimate"},
];

const SEED_CONTRIBS = [
  {id:"c1",projectId:"p1",residentId:"r1",date:"2025-03-15",amount:50000,note:"Contribution"},
  {id:"c2",projectId:"p1",residentId:"r2",date:"2025-03-15",amount:50000,note:"Contribution"},
  {id:"c3",projectId:"p1",residentId:"r3",date:"2025-04-20",amount:50000,note:"Contribution"},
  {id:"c4",projectId:"p1",residentId:"r4",date:"2025-05-10",amount:50000,note:"Contribution"},
  {id:"c5",projectId:"p1",residentId:"r5",date:"2025-06-01",amount:50000,note:"Contribution"},
  {id:"c6",projectId:"p1",residentId:"r6",date:"2025-07-15",amount:50000,note:"Contribution"},
  {id:"c7",projectId:"p2",residentId:"r7",date:"2025-08-01",amount:10000,note:"Contribution"},
  {id:"c8",projectId:"p2",residentId:"r8",date:"2025-09-01",amount:10000,note:"Contribution"},
];
const SEED_REMINDERS = [
  {id:"rem1",residentId:"r5",date:"2025-03-10",method:"WhatsApp",note:"Sent reminder about February arrears",sentBy:"Estate Manager"},
  {id:"rem2",residentId:"r5",date:"2025-06-15",method:"Call",note:"Called regarding growing balance",sentBy:"Estate Manager"},
  {id:"rem3",residentId:"r8",date:"2025-12-01",method:"WhatsApp",note:"Reminded about November payment",sentBy:"Estate Manager"},
];

function calcBal(residentId, transactions) {
  return [...transactions]
    .filter(t => t.residentId === residentId)
    .sort((a,b) => a.date.localeCompare(b.date))
    .reduce((b,t) => t.type === "payment" ? b - t.amount : b + t.amount, 0);
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
  const charged = rows.filter(t => t.type !== "payment").reduce((s,t) => s + t.amount, 0);
  const paid = rows.filter(t => t.type === "payment").reduce((s,t) => s + t.amount, 0);
  win.document.write(`<!doctype html><html><head><title>Statement - ${escapeHtml(resident.name)}</title><style>
    *{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#102419;padding:32px}header{display:flex;justify-content:space-between;border-bottom:3px solid #1a6b3a;padding-bottom:16px;margin-bottom:22px}h1{font-size:20px;color:#1a6b3a;margin:0}h2{font-size:16px;margin:0 0 4px}.muted{color:#66786c}.balance{border:1px solid #c8d8cb;border-radius:8px;padding:14px 18px;margin-bottom:20px}.amount{font-size:22px;font-weight:800;color:${balance > 0 ? "#c0392b" : balance < 0 ? "#2471a3" : "#1a6b3a"}}table{width:100%;border-collapse:collapse}th{background:#1a6b3a;color:#fff;text-align:left;padding:8px}td{padding:7px 8px;border-bottom:1px solid #e4ede6}th:nth-child(n+3),td:nth-child(n+3){text-align:right}tfoot{font-weight:800;background:#f4f8f5}footer{margin-top:24px;border-top:1px solid #d4e4d7;padding-top:10px;color:#66786c;font-size:10px;display:flex;justify-content:space-between}@media print{body{padding:16px}}
  </style></head><body><header><div><h1>Lemayian Court</h1><div class="muted">Estate Manager · Account statement</div></div><div><h2>${escapeHtml(resident.name)}</h2><div class="muted">Unit ${escapeHtml(resident.unit)}</div></div></header><div class="balance"><div class="muted">Balance as of ${new Date().toLocaleDateString("en-KE",{day:"numeric",month:"long",year:"numeric"})}</div><div class="amount">${balance > 0 ? `KES ${fmt(balance)} owed` : balance < 0 ? `KES ${fmt(Math.abs(balance))} credit` : "Fully settled"}</div></div><div class="muted" style="margin-bottom:12px">Statement Period: Full history · ${rows.length} transaction${rows.length!==1?"s":""}</div><table><thead><tr><th>Date</th><th>Description</th><th>M-Pesa ref</th><th>Charge</th><th>Payment</th><th>Balance</th></tr></thead><tbody>${rows.map(t => `<tr><td>${escapeHtml(t.date)}</td><td>${escapeHtml(t.note || t.type)}</td><td>${escapeHtml(t.mpesa || "-")}</td><td>${t.type !== "payment" ? `KES ${fmt(t.amount)}` : ""}</td><td>${t.type === "payment" ? `KES ${fmt(t.amount)}` : ""}</td><td>KES ${fmt(Math.abs(t.run))}${t.run < 0 ? " Cr" : ""}</td></tr>`).join("")}</tbody><tfoot><tr><td colspan="3">Totals</td><td>KES ${fmt(charged)}</td><td>KES ${fmt(paid)}</td><td>${balance > 0 ? `KES ${fmt(balance)} owed` : balance < 0 ? `KES ${fmt(Math.abs(balance))} credit` : "Settled"}</td></tr></tfoot></table><footer><span>Generated ${new Date().toLocaleString("en-KE")}</span><span>Lemayian Court · Nairobi, Kenya</span></footer><script>window.onload=function(){window.print();}</script></body></html>`);
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
  {page:"dashboard", emoji:"🏡", title:"Your Command Centre", body:"See total collections, outstanding balances, and arrears — all at a glance."},
  {page:"residents", emoji:"👥", title:"Resident Statements", body:"Each resident has a live ledger showing every charge, payment, and running balance — exactly like your PDF but editable in real time."},
  {page:"payments",  emoji:"💳", title:"Post Levies & Payments", body:"Post the monthly levy to all residents in one click, or record individual payments as they arrive."},
  {page:"projects",  emoji:"🔨", title:"Special Projects", body:"Track funding targets for projects like the GateHouse — with a progress bar and contributions per resident."},
  {page:"reminders", emoji:"🔔", title:"Arrears Reminder Log", body:"Record WhatsApp, call, SMS, email, letter, or visit follow-ups with residents in arrears."},
  {page:"reports",   emoji:"📊", title:"Reports & Analytics", body:"Monthly bar charts, collection rates, and a full resident summary. Your year-end report is always ready."},
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
  const isDebit = txn.type !== "payment";
  return (
    <Modal title="Transaction Receipt" onClose={onClose} w={360}>
      <div style={{textAlign:"center",marginBottom:"1.1rem"}}>
        <div style={{width:54,height:54,background:isDebit?"#fff1f0":"#eaf5ed",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 0.7rem",fontSize:"1.5rem"}}>{isDebit?"📋":"✅"}</div>
        <div style={{fontSize:"0.75rem",color:"#8a9e91",marginBottom:"0.2rem"}}>{txn.type==="payment" ? "Payment Received" : "Charge Posted"}</div>
        <div style={{fontSize:"1.9rem",fontWeight:900,color:isDebit?"#c0392b":"#1a6b3a",fontVariantNumeric:"tabular-nums"}}>KES {fmt(txn.amount)}</div>
      </div>
      <div style={{background:"#f4f8f5",borderRadius:10,overflow:"hidden"}}>
            {[ ["Resident",res?.name], ["Unit",res?.unit], ["Date",txn.date], ["Ref",txn.id.slice(0,14)], txn.mpesa ? ["M-Pesa ref",txn.mpesa] : null, ["Description",txn.note], txn.security ? ["Security", `KES ${fmt(txn.security)}`] : null, txn.others ? ["Others", `KES ${fmt(txn.others)}`] : null ].filter(Boolean).map(([k,v],i,a) => (
          <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"0.52rem 0.9rem",borderBottom:i<a.length-1?"1px solid #e4ede6":"none"}}>
            <span style={{color:"#6b7f72",fontSize:"0.79rem"}}>{k}</span>
            <span style={{fontWeight:700,fontSize:"0.79rem",color:"#0f2417",maxWidth:200,textAlign:"right"}}>{v}</span>
          </div>
        ))}
      </div>
      <BTN onClick={onClose} style={{width:"100%",justifyContent:"center",marginTop:"1rem"}}>Close</BTN>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
function Dashboard({ residents, transactions, setPage }) {
  const bals = residents.map(r => ({...r, bal: calcBal(r.id, transactions)}));
    const owed = bals.filter(r => r.bal > 0).reduce((s,r) => s + r.bal, 0);
  const cred = bals.filter(r => r.bal < 0).reduce((s,r) => s+Math.abs(r.bal), 0);
  const paid = transactions.filter(t => t.type==="payment").reduce((s,t) => s+t.amount, 0);
  const levied = transactions.filter(t => t.type!=="payment").reduce((s,t) => s+t.amount, 0);
  const rate = levied > 0 ? Math.round((paid/levied)*100) : 0;
  const overdue = bals.filter(r => r.bal > 0).sort((a,b) => b.bal-a.bal);
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
        <div style={{background:"#fff",borderRadius:12,padding:"1rem 1.15rem",border:"1px solid #e2ece4",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          <div style={{fontSize:"0.71rem",fontWeight:800,color:"#6b7f72",textTransform:"uppercase",letterSpacing:"0.055em",marginBottom:"0.6rem",alignSelf:"flex-start"}}>Collection Rate</div>
          <svg width={72} height={72} viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" stroke="#e8f0eb" strokeWidth="10"/>
            <circle cx="40" cy="40" r="32" fill="none" stroke={rate>=90?"#1a6b3a":rate>=70?"#e67e22":"#c0392b"} strokeWidth="10" strokeDasharray={`${(rate/100)*circ} ${circ}`} strokeLinecap="round" transform="rotate(-90 40 40)"/>
            <text x="40" y="44" textAnchor="middle" fontSize="15" fontWeight="800" fill="#0f2417">{rate}%</text>
          </svg>
        </div>
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
          {[["Residents",residents.length,"#0f2417"],["In Arrears",overdue.length,"#c0392b"],["Settled",bals.filter(r=>r.bal<=0).length,"#1a6b3a"],["Monthly Levy",`KES ${fmt(MONTHLY_TOTAL)}`,"#0f2417"]].map(([k,v,c]) => (
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"0.52rem 1rem",borderBottom:"1px solid #eef3ef",fontSize:"0.82rem"}}>
              <span style={{color:"#6b7f72"}}>{k}</span><span style={{fontWeight:800,color:c}}>{v}</span>
            </div>
          ))}
          <div style={{padding:"0.75rem 1rem"}}><BTN v="sec" style={{width:"100%",justifyContent:"center",fontSize:"0.77rem"}} onClick={() => setPage("payments")}>📋 Post This Month's Levy</BTN></div>
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
function Residents({ residents, setResidents, transactions, setTransactions, contribs, setContribs, toast }) {
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
  if (view) return <Statement resident={view} transactions={transactions} setTransactions={setTransactions} onBack={() => setView(null)} toast={toast}/>;
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
                <BTN v="dan" sz="sm" onClick={() => del(r)}><Ico n="trash" sz={13}/></BTN>
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
function Statement({ resident, transactions, setTransactions, onBack, toast }) {
  const [showPay, setShowPay] = useState(false);
  const [showChg, setShowChg] = useState(false);
  const [rec, setRec] = useState(null);
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [pFm, setPFm] = useState({date:today(),amount:"",note:"Payment",mpesa:""});
  const [cFm, setCFm] = useState({date:today(),security:MONTHLY_SECURITY,others:MONTHLY_OTHERS,note:"Monthly levy"});
  const {confirm, dialog} = useConfirm();
  const myT = [...transactions].filter(t => t.residentId===resident.id).sort((a,b) => a.date.localeCompare(b.date));
  let run = 0;
  const rows = myT.map(t => { if(t.type==="payment") run-=t.amount; else run+=t.amount; return {...t,run}; });
  const trueBal = run;
  const shown = rows.filter(t => {
    if (q && !t.note?.toLowerCase().includes(q.toLowerCase()) && !t.date.includes(q) && !String(t.amount).includes(q)) return false;
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  });
  const isFiltered = Boolean(q || dateFrom || dateTo);
  const exportThisCSV = () => {
    exportCSV(`statement-${resident.name.replace(/\s+/g,"-")}-${today()}.csv`, ["Date","Description","Type","M-Pesa reference","Charge","Payment","Balance"], shown.map(t => [t.date,t.note,t.type,t.mpesa || "",t.type!=="payment"?t.amount:"",t.type==="payment"?t.amount:"",t.run]));
    toast("Statement exported to CSV");
  };
  const addPay = async () => {
    const a = parseFloat(pFm.amount);
    if (!a||a<=0) { toast("Enter valid amount","error"); return; }
    if (a > trueBal && trueBal > 0 && !await confirm(`This payment (KES ${fmt(a)}) is more than the balance owed (KES ${fmt(trueBal)}).\n\nKES ${fmt(a-trueBal)} will be in credit. Continue?`)) return;
    setTransactions(p => [...p, {id:uid(),residentId:resident.id,date:pFm.date,type:"payment",amount:a,security:0,others:0,note:pFm.note,mpesa:pFm.mpesa.trim().toUpperCase()}]);
    toast(`KES ${fmt(a)} recorded${pFm.mpesa ? ` · M-Pesa ${pFm.mpesa.toUpperCase()}` : ""}`); setPFm({date:today(),amount:"",note:"Payment",mpesa:""}); setShowPay(false);
  };
  const addChg = () => {
    const s=parseFloat(cFm.security)||0, o=parseFloat(cFm.others)||0;
    if (s + o <= 0) { toast("Enter a charge amount","error"); return; }
    setTransactions(p => [...p, {id:uid(),residentId:resident.id,date:cFm.date,type:"charge",amount:s+o,security:s,others:o,note:cFm.note}]);
    toast(`Charge KES ${fmt(s+o)} posted`); setCFm({date:today(),security:MONTHLY_SECURITY,others:MONTHLY_OTHERS,note:"Monthly levy"}); setShowChg(false);
  };
  const delT = async (t) => { if (!await confirm("Delete this transaction?\n\nThis cannot be undone.")) return; setTransactions(p => p.filter(x => x.id!==t.id)); toast("Deleted","warn"); };
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
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.79rem",minWidth:560}}>
          <thead><tr style={{background:"#f4f8f5"}}>{["Date","Description","Charge","Payment","Balance",""].map((h,i) => <th key={i} style={{padding:"0.52rem 0.78rem",textAlign:i>=2&&i<5?"right":"left",color:"#4a6352",fontWeight:800,fontSize:"0.69rem",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>
            {shown.length===0 && <tr><td colSpan={6} style={{textAlign:"center",padding:"2.5rem",color:"#8a9e91",fontStyle:"italic"}}>{q?"No matches":"No transactions yet"}</td></tr>}
            {shown.map(t => (
              <tr key={t.id} style={{borderBottom:"1px solid #eef3ef",cursor:"pointer"}} onClick={() => setRec(t)}>
                <td style={{padding:"0.48rem 0.78rem",color:"#4a6352",whiteSpace:"nowrap"}}>{t.date}</td>
                <td style={{padding:"0.48rem 0.78rem",color:"#0f2417",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.note}</td>
                <td style={{padding:"0.48rem 0.78rem",textAlign:"right",color:"#c0392b",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{t.type!=="payment"?`KES ${fmt(t.amount)}`:""}</td>
                <td style={{padding:"0.48rem 0.78rem",textAlign:"right",color:"#1a6b3a",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{t.type==="payment"?`KES ${fmt(t.amount)}`:""}</td>
                <td style={{padding:"0.48rem 0.78rem",textAlign:"right",fontWeight:800,fontVariantNumeric:"tabular-nums",color:t.run>0?"#c0392b":t.run<0?"#2471a3":"#1a6b3a"}}>KES {fmt(Math.abs(t.run))}{t.run<0?" Cr":""}</td>
                <td style={{padding:"0.48rem 0.6rem",textAlign:"right"}} onClick={e => e.stopPropagation()}><BTN v="dan" sz="sm" onClick={() => delT(t)} style={{padding:"3px 6px"}}><Ico n="trash" sz={11}/></BTN></td>
              </tr>
            ))}
          </tbody>
          {shown.length>0 && <tfoot><tr style={{background:"#f4f8f5",fontWeight:900}}>
            <td colSpan={2} style={{padding:"0.58rem 0.78rem",color:"#0f2417"}}>Totals{isFiltered?" (filtered)":""}</td>
            <td style={{padding:"0.58rem 0.78rem",textAlign:"right",color:"#c0392b",fontVariantNumeric:"tabular-nums"}}>KES {fmt(shown.filter(t=>t.type!=="payment").reduce((s,t)=>s+t.amount,0))}</td>
            <td style={{padding:"0.58rem 0.78rem",textAlign:"right",color:"#1a6b3a",fontVariantNumeric:"tabular-nums"}}>KES {fmt(shown.filter(t=>t.type==="payment").reduce((s,t)=>s+t.amount,0))}</td>
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
                <div style={{...FL,justifyContent:"space-between",fontSize:"0.74rem",color:"#6b7f72",marginBottom:"0.85rem"}}><span><b style={{color:"#1a6b3a"}}>KES {fmt(coll)}</b> collected ({pct.toFixed(1)}%)</span><span>{proj.target>coll?`KES ${fmt(proj.target-coll)} remaining`:"🎉 Fully funded"}</span></div>
                <div style={{...FL,justifyContent:"space-between"}}>
                  <BDG c="#1a6b3a" bg="#eaf5ed">{pc.length} contribution{pc.length!==1?"s":""}</BDG>
                  <div style={{...FL,gap:"0.5rem"}}><BTN v="sec" sz="sm" onClick={() => { setCFm({residentId:"",date:today(),amount:"",note:"Contribution"}); setAddC(proj.id); }}>+ Contribution</BTN><BTN v="dan" sz="sm" onClick={() => delP(proj)}><Ico n="trash" sz={12}/></BTN></div>
                </div>
              </div>
              {pc.length>0 && <div style={{borderTop:"1px solid #eef3ef",overflow:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.77rem"}}>
                  <thead><tr style={{background:"#f4f8f5"}}>{["Date","Resident","Amount"].map(h => <th key={h} style={{padding:"0.38rem 0.9rem",textAlign:h==="Amount"?"right":"left",color:"#4a6352",fontWeight:800,fontSize:"0.69rem",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                  <tbody>{pc.sort((a,b)=>b.date.localeCompare(a.date)).map(c => { const r=residents.find(x=>x.id===c.residentId); return <tr key={c.id} style={{borderBottom:"1px solid #eef3ef"}}><td style={{padding:"0.38rem 0.9rem",color:"#4a6352"}}>{c.date}</td><td style={{padding:"0.38rem 0.9rem",fontWeight:700}}>{r?.name}</td><td style={{padding:"0.38rem 0.9rem",textAlign:"right",color:"#1a6b3a",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>KES {fmt(c.amount)}</td></tr>; })}</tbody>
                </table>
              </div>}
            </div>
          );
        })}
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
function Reports({ residents, transactions }) {
  const yrs = [...new Set(transactions.map(t=>t.date.slice(0,4)))].sort().reverse();
  const [yr, setYr] = useState(yrs[0]||"2025");
  const mo = MONTHS.map((m,mi) => {
    const pre = `${yr}-${String(mi+1).padStart(2,"0")}`;
    const ch = transactions.filter(t=>t.date.startsWith(pre)&&t.type!=="payment").reduce((s,t)=>s+t.amount,0);
    const pa = transactions.filter(t=>t.date.startsWith(pre)&&t.type==="payment").reduce((s,t)=>s+t.amount,0);
    return {m,ch,pa,diff:ch-pa};
  });
  const tCh=mo.reduce((s,m)=>s+m.ch,0), tPa=mo.reduce((s,m)=>s+m.pa,0);
  const rate = tCh>0 ? Math.round((tPa/tCh)*100) : 0;
  const mx = Math.max(...mo.flatMap(m=>[m.ch,m.pa]),1);
  const exportReport = () => exportCSV(`lemayian-court-report-${yr}.csv`,["Month","Levied","Collected","Deficit","Rate %"],mo.map(m => [`${m.m} ${yr}`,m.ch,m.pa,m.diff,m.ch>0?Math.round((m.pa/m.ch)*100):""]));
  const bals = residents.map(r => ({...r, paid:transactions.filter(t=>t.residentId===r.id&&t.type==="payment").reduce((s,t)=>s+t.amount,0), bal:calcBal(r.id,transactions)}));
  return (
    <div>
      <div style={{...FL,justifyContent:"space-between",marginBottom:"1.35rem",flexWrap:"wrap",gap:"0.7rem"}}>
        <div><h2 style={{margin:0,fontSize:"1.3rem",fontWeight:900,color:"#0f2417"}}>Reports</h2><p style={{margin:"0.2rem 0 0",color:"#6b7f72",fontSize:"0.84rem"}}>Collection performance & financial summary</p></div>
        <div style={{...FL,gap:"0.55rem"}}><LBL c="Year"/><SEL value={yr} onChange={e=>setYr(e.target.value)} style={{width:"auto",padding:"0.42rem 0.72rem"}}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}{!yrs.includes("2025")&&<option value="2025">2025</option>}</SEL><BTN v="sec" sz="sm" onClick={exportReport}>⇩ Export CSV</BTN><BTN v="gho" sz="sm" onClick={() => window.print()}>🖨 Print</BTN></div>
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
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════
function Reminders({ residents, reminders, setReminders, transactions, toast }) {
  const [add, setAdd] = useState(false);
  const [fm, setFm] = useState({residentId:"",date:today(),method:"WhatsApp",note:"",sentBy:"Estate Manager"});
  const {confirm, dialog} = useConfirm();
  const save = () => {
    if (!fm.residentId) { toast("Select a resident","error"); return; }
    if (!fm.note.trim()) { toast("Add a reminder note","error"); return; }
    setReminders(p => [...p, {id:uid(),...fm}]);
    toast("Reminder logged"); setFm({residentId:"",date:today(),method:"WhatsApp",note:"",sentBy:"Estate Manager"}); setAdd(false);
  };
  const remove = async id => { if (!await confirm("Delete this reminder?\n\nThis cannot be undone.")) return; setReminders(p => p.filter(item => item.id !== id)); toast("Reminder deleted","warn"); };
  const sorted = [...reminders].sort((a,b) => b.date.localeCompare(a.date));
  return <div>
    <div style={{...FL,justifyContent:"space-between",marginBottom:"1.35rem",flexWrap:"wrap",gap:"0.7rem"}}><div><h2 style={{margin:0,fontSize:"1.3rem",fontWeight:900,color:"#0f2417"}}>Reminder Log</h2><p style={{margin:"0.2rem 0 0",color:"#6b7f72",fontSize:"0.84rem"}}>Keep an accountability trail for arrears follow-up</p></div><BTN onClick={() => setAdd(true)}>🔔 Log Reminder</BTN></div>
    <div style={{display:"grid",gap:"0.65rem"}}>{sorted.map(item => { const resident=residents.find(r => r.id===item.residentId); return <div key={item.id} style={{background:"#fff",border:"1px solid #e2ece4",borderRadius:12,padding:"0.95rem 1.2rem",...FL,gap:"0.9rem"}}><div style={{fontSize:"1.25rem"}}>{item.method==="Call"?"📞":item.method==="SMS"?"📱":item.method==="Email"?"📧":"💬"}</div><div style={{flex:1}}><div style={{fontWeight:800,color:"#0f2417"}}>{resident?.name || "Unknown resident"} <BDG>{item.method}</BDG> <span style={{fontSize:"0.75rem",color:"#8a9e91",fontWeight:400}}>{item.date}</span></div><div style={{fontSize:"0.82rem",color:"#4a6352",marginTop:2}}>{item.note}</div><div style={{fontSize:"0.72rem",color:"#8a9e91",marginTop:2}}>Sent by: {item.sentBy}</div></div><BTN v="dan" sz="sm" onClick={() => remove(item.id)}><Ico n="trash" sz={12}/></BTN></div>; })}</div>
    {sorted.length===0 && <div style={{textAlign:"center",padding:"3rem",color:"#8a9e91",background:"#fff",borderRadius:12,border:"1px solid #e2ece4"}}>No reminders logged yet.</div>}
    {add && <Modal title="Log Reminder" onClose={() => setAdd(false)}><FLD label="Resident"><SEL value={fm.residentId} onChange={e=>setFm(p=>({...p,residentId:e.target.value}))}><option value="">-- Select resident --</option>{residents.map(r=><option key={r.id} value={r.id}>{r.name} ({r.unit})</option>)}</SEL></FLD><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.7rem"}}><FLD label="Date"><INP type="date" value={fm.date} onChange={e=>setFm(p=>({...p,date:e.target.value}))}/></FLD><FLD label="Method"><SEL value={fm.method} onChange={e=>setFm(p=>({...p,method:e.target.value}))}>{["WhatsApp","Call","SMS","Email","Letter","Visit"].map(method=><option key={method}>{method}</option>)}</SEL></FLD></div><FLD label="Note"><TXA value={fm.note} onChange={e=>setFm(p=>({...p,note:e.target.value}))} placeholder="What was communicated?" rows={3}/></FLD><FLD label="Sent by"><INP value={fm.sentBy} onChange={e=>setFm(p=>({...p,sentBy:e.target.value}))}/></FLD><div style={{...FL,justifyContent:"flex-end",gap:"0.65rem"}}><BTN v="sec" onClick={() => setAdd(false)}>Cancel</BTN><BTN onClick={save}>Log Reminder</BTN></div></Modal>}
    {dialog}
  </div>;
}

function Settings({ residents, setResidents, transactions, setTransactions, projects, setProjects, contribs, setContribs, reminders, setReminders, toast }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const {confirm, dialog} = useConfirm();
  const backup = () => {
    const data = {version:2, exported:new Date().toISOString(), residents, transactions, projects, contribs, reminders};
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
      setAuthToken(token); setAuthUser(result.user); setResidents(result.data.residents); setTxns(result.data.transactions); setProjects(result.data.projects); setContribs(result.data.contribs); setReminders(result.data.reminders || []); setLoaded(true); setAuthMode("signed-in");
    }).catch(async () => {
      const refreshToken = sg(REFRESH_KEY, null);
      if (!refreshToken) throw new Error("No refresh token");
      const next = await apiRequest("/auth/refresh", {method:"POST",body:JSON.stringify({refreshToken})});
      ss(AUTH_KEY, next.accessToken); ss(REFRESH_KEY, next.refreshToken);
      return apiRequest("/me", {}, next.accessToken).then(result => { setAuthToken(next.accessToken); setAuthUser(result.user); setResidents(result.data.residents); setTxns(result.data.transactions); setProjects(result.data.projects); setContribs(result.data.contribs); setReminders(result.data.reminders || []); setLoaded(true); setAuthMode("signed-in"); });
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
  useEffect(() => {
    if (!loaded || authMode !== "signed-in") return;
    const timer = setTimeout(() => apiRequest("/data", {method:"PUT",body:JSON.stringify({residents,transactions:txns,projects,contribs,reminders})}, authToken).catch(() => toast("Cloud sync failed", "error")), 350);
    return () => clearTimeout(timer);
  }, [residents, txns, projects, contribs, reminders, loaded, authMode, authToken, toast]);

  const authenticated = data => {
    ss(AUTH_KEY, data.accessToken || data.token); ss(REFRESH_KEY, data.refreshToken || null); setAuthToken(data.accessToken || data.token); setAuthUser(data.user);
    const source = data.data.residents.length ? data.data : {residents:SEED_RESIDENTS,transactions:buildSeedTxns(),projects:SEED_PROJECTS,contribs:SEED_CONTRIBS};
    setResidents(source.residents); setTxns(source.transactions); setProjects(source.projects); setContribs(source.contribs); setReminders(source.reminders || []); setLoaded(true); setAuthMode("signed-in");
  };
  const offline = () => { ss(AUTH_KEY, null); ss(REFRESH_KEY, null); setResidents(sg(KEYS.r, null) ?? SEED_RESIDENTS); setTxns(sg(KEYS.t, null) ?? buildSeedTxns()); setProjects(sg(KEYS.p, null) ?? SEED_PROJECTS); setContribs(sg(KEYS.c, null) ?? SEED_CONTRIBS); setReminders(sg(KEYS.rem, null) ?? SEED_REMINDERS); setLoaded(true); setAuthMode("offline"); if (!sg(KEYS.tour, false)) setTourStep(0); };
  const logout = () => { ss(AUTH_KEY, null); ss(REFRESH_KEY, null); setAuthToken(null); setAuthUser(null); setLoaded(false); setTourStep(null); setAuthMode("signed-out"); };

  const tourNext = () => {
    const nx = tourStep + 1;
    if (nx >= TOUR.length) { setTourStep(null); ss(KEYS.tour, true); return; }
    setPage(TOUR[nx].page); setTourStep(nx);
  };
  const tourSkip = () => { setTourStep(null); ss(KEYS.tour, true); };

  if (authMode === "checking") return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#f0f5f1",fontFamily:"system-ui"}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:"2.5rem",marginBottom:"0.75rem"}}>🏡</div><div style={{color:"#4a6352",fontWeight:700}}>Loading…</div></div>
    </div>
  );
  if (authMode === "signed-out") return <AuthScreen onAuthenticated={authenticated} onOffline={offline}/>;
  if (!loaded) return <div style={{padding:"2rem",fontFamily:"system-ui"}}>Loading…</div>;

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
          .app-sidebar > div:last-child { display: none; }
          .app-main main { padding: 1rem !important; }
          .app-main > div:first-child { position: static !important; }
        }
      `}</style>

      {/* Sidebar */}
      <div className="app-sidebar no-print" style={{width:216,background:"#0d1f13",flexShrink:0,display:"flex",flexDirection:"column",minHeight:"100vh",position:"sticky",top:0,height:"100vh"}}>
        <div style={{padding:"1.35rem 1.2rem 0.9rem",borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
          <div style={{fontWeight:900,fontSize:"0.94rem",color:"#fff",lineHeight:1.2}}>🏡 Lemayian Court</div>
          <div style={{fontSize:"0.67rem",color:"#6aaa7a",marginTop:"0.22rem",textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:800}}>Estate Manager</div>
        </div>
        <nav style={{flex:1,padding:"0.7rem 0.62rem",overflowY:"auto"}}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)} style={{width:"100%",display:"flex",alignItems:"center",gap:"0.58rem",padding:"0.58rem 0.72rem",border:"none",borderRadius:9,cursor:"pointer",background:page===n.id?"rgba(106,170,122,0.17)":"transparent",color:page===n.id?"#7dca8c":"rgba(255,255,255,0.52)",fontSize:"0.83rem",fontWeight:page===n.id?800:500,marginBottom:"0.1rem",textAlign:"left",borderLeft:page===n.id?"3px solid #6aaa7a":"3px solid transparent",fontFamily:"inherit"}}>
              <Ico n={n.n} sz={15}/>{n.l}{n.id==="reminders" && residents.some(r => calcBal(r.id,txns)>0) && <span style={{marginLeft:"auto",background:"#c0392b",color:"#fff",borderRadius:99,padding:"1px 6px",fontSize:"0.65rem",fontWeight:900}}>{residents.filter(r => calcBal(r.id,txns)>0).length}</span>}
            </button>
          ))}
        </nav>
        <div style={{padding:"0.9rem 1.2rem",borderTop:"1px solid rgba(255,255,255,0.07)"}}>
          <button onClick={() => { setTourStep(0); setPage(TOUR[0].page); }} style={{background:"rgba(106,170,122,0.13)",border:"1px solid rgba(106,170,122,0.28)",borderRadius:8,color:"#6aaa7a",fontSize:"0.74rem",fontWeight:800,padding:"0.42rem 0.72rem",cursor:"pointer",width:"100%",textAlign:"left",fontFamily:"inherit"}}>🎓 App Tour</button>
          {authMode === "signed-in" ? <button onClick={logout} style={{marginTop:"0.55rem",background:"transparent",border:"1px solid rgba(255,255,255,0.14)",borderRadius:8,color:"rgba(255,255,255,0.62)",fontSize:"0.7rem",padding:"0.4rem 0.72rem",cursor:"pointer",width:"100%",textAlign:"left",fontFamily:"inherit"}}>Sign out{authUser?.email ? ` · ${authUser.email}` : ""}</button> : <div style={{fontSize:"0.68rem",color:"#d9b35c",marginTop:"0.6rem"}}>Offline demo mode</div>}
          <div style={{fontSize:"0.63rem",color:"rgba(255,255,255,0.2)",marginTop:"0.65rem",textAlign:"center"}}>© 2025 Lemayian Court</div>
        </div>
      </div>

      {/* Main content */}
      <div className="app-main" style={{flex:1,minWidth:0,display:"flex",flexDirection:"column"}}>
        <div style={{background:"#fff",borderBottom:"1px solid #e2ece4",padding:"0.7rem 1.4rem",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
          <div style={{fontWeight:800,color:"#0f2417",fontSize:"0.91rem"}}>{NAV.find(n=>n.id===page)?.l}</div>
          <div style={{fontSize:"0.77rem",color:"#8a9e91"}}>{new Date().toLocaleDateString("en-KE",{weekday:"short",year:"numeric",month:"short",day:"numeric"})}</div>
        </div>
        <main style={{flex:1,padding:"1.4rem",maxWidth:920,width:"100%"}}>
          {page==="dashboard" && <Dashboard residents={residents} transactions={txns} setPage={setPage}/>}
          {page==="residents" && <Residents residents={residents} setResidents={setResidents} transactions={txns} setTransactions={setTxns} contribs={contribs} setContribs={setContribs} toast={toast}/>}
          {page==="payments"  && <Payments  residents={residents} transactions={txns} setTransactions={setTxns} toast={toast}/>}
          {page==="projects"  && <Projects  projects={projects} setProjects={setProjects} contribs={contribs} setContribs={setContribs} residents={residents} toast={toast}/>}
          {page==="reminders" && <Reminders residents={residents} reminders={reminders} setReminders={setReminders} transactions={txns} toast={toast}/>}
          {page==="reports"   && <Reports   residents={residents} transactions={txns}/>}
          {page==="settings"  && <Settings  residents={residents} setResidents={setResidents} transactions={txns} setTransactions={setTxns} projects={projects} setProjects={setProjects} contribs={contribs} setContribs={setContribs} reminders={reminders} setReminders={setReminders} toast={toast}/>}
        </main>
      </div>

      <Toasts toasts={toasts} remove={remove}/>
      {tourStep !== null && <Tour step={tourStep} onNext={tourNext} onSkip={tourSkip}/>}
    </div>
  );
}

export { buildSeedTxns, calcBal, hasDuplicateCharge, isValidBackup, removeResidentData };

