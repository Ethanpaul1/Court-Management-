import { buildSeedTxns, calcBal, hasDuplicateCharge, isValidBackup, removeResidentData,
         reconcile, WORKBOOK_CLOSING, WORKBOOK_OPENING_2026, WORKBOOK_GATEHOUSE,
         normaliseKenyanPhone, waLink, migrateLegacyStorage, WORKBOOK_GATEHOUSE_ITEMS,
         SEED_CONTRIBS, SEED_REMINDERS, WORKBOOK_PAYMENT_REFERENCES,
         workbookYearBreaks, reminderSchedule } from "./App";
import { WORKBOOK_LEDGER } from "./workbookLedger";

const SEED_RESIDENTS = [
  {id:"r1",name:"Hon. Ndetei"},{id:"r2",name:"Esther Gicimu"},{id:"r3",name:"Njoroge"},
  {id:"r4",name:"Magomere"},{id:"r5",name:"Karanja"},{id:"r6",name:"Muriuki"},
  {id:"r7",name:"Mbindu"},{id:"r8",name:"Mwanthi"},
];

describe("workbook import and reconciliation", () => {
  const transactions = buildSeedTxns();

  test("2026 closing balances reconcile against the workbook", () => {
    Object.entries(WORKBOOK_CLOSING).forEach(([id, expected]) => {
      expect(calcBal(id, transactions)).toBe(expected);
    });
  });

  test("2026 opening balances are the workbook b/fwd positions", () => {
    // The 2026 sheet's b/fwd row is the opening position of the current ledger year.
    // Earlier years' b/fwd rows are retained as `restated` history and must not be summed.
    const tx = buildSeedTxns();
    const openingOf = id => {
      const row = tx
        .filter(t => t.residentId === id && (t.type === "restated" || t.type === "openingBalance"))
        .sort((a,b) => a.date.localeCompare(b.date))
        .pop();
      return row ? row.amount : 0;
    };
    Object.entries(WORKBOOK_OPENING_2026).forEach(([id, expected]) => {
      expect(openingOf(id)).toBe(expected);
    });
  });

  test("closing = opening + charges - payments for every resident", () => {
    const rows = reconcile(SEED_RESIDENTS, transactions);
    rows.forEach(r => {
      expect(r.calculated).toBe(r.opening + r.charges - r.payments + r.adjustments);
      expect(r.status).toBe("reconciled");
      expect(r.difference).toBe(0);
    });
  });

  test("every imported year from 2021 to 2026 is present with transactions", () => {
    const years = [...new Set(WORKBOOK_LEDGER.map(e => e.y))].sort();
    expect(years).toEqual(["2021","2022","2023","2024","2025","2026"]);
    years.forEach(y => {
      expect(transactions.some(t => t.date.startsWith(y))).toBe(true);
    });
    const expectedByYear = {2021:163,2022:161,2023:168,2024:173,2025:157,2026:117};
    Object.entries(expectedByYear).forEach(([year,count]) => {
      expect(transactions.filter(t => t.date.startsWith(year))).toHaveLength(count);
    });
    expect(transactions).toHaveLength(939);
  });

  test("historical levy rates are preserved per year, not retro-applied", () => {
    const charges = transactions.filter(t => t.type === "charge");
    const rateFor = year => {
      const set = new Set(
        charges.filter(t => t.date.startsWith(year)).map(t => `${t.security}+${t.others}`)
      );
      return set;
    };
    // 2021 used the KES 3,500 rate (3250 + 250); 2023 used 3625 + 375
    expect(rateFor("2021").has("3250+250")).toBe(true);
    expect(rateFor("2023").has("3625+375")).toBe(true);
    // the current split must never appear on a 2021 row
    expect(rateFor("2021").has("3750+250")).toBe(false);
  });

  test("annual carry-forward checks include same-row credits and report the workbook break", () => {
    expect(workbookYearBreaks()).toEqual([
      {residentId:"r1",from:"2024",to:"2025",previousClosing:4250,thisOpening:-2750,difference:-7000},
    ]);
  });

  test("all money values are exact integers", () => {
    WORKBOOK_LEDGER.forEach(e => {
      [e.s, e.o, e.c].forEach(v => expect(Number.isInteger(v)).toBe(true));
    });
    transactions.forEach(t => {
      expect(Number.isInteger(t.amount)).toBe(true);
      expect(Number.isInteger(t.security)).toBe(true);
      expect(Number.isInteger(t.others)).toBe(true);
    });
  });

  test("every transaction is traceable to its source worksheet row", () => {
    const sourceRows = new Set(WORKBOOK_LEDGER.map(row => row.src));
    transactions.forEach(t => expect(sourceRows.has(t.source)).toBe(true));
    expect(transactions.every(t => /^\d{4}!R\d+C\d+$/.test(t.source))).toBe(true);
  });

  test("credits recorded on charge rows are imported as separate payments", () => {
    const mixedRows = WORKBOOK_LEDGER.filter(row => row.k === "charge" && row.c > 0);
    expect(mixedRows.length).toBeGreaterThan(0);
    mixedRows.forEach(sourceRow => {
      const rows = transactions.filter(t => t.source === sourceRow.src);
      expect(rows.some(t => t.type === "charge" && t.amount === sourceRow.s + sourceRow.o)).toBe(true);
      expect(rows.some(t => t.type === "payment" && t.amount === sourceRow.c)).toBe(true);
    });
  });

  test("b/fwd rows are opening balances, never counted as levies", () => {
    const bfwd = transactions.filter(t => t.type === "openingBalance" || t.type === "restated");
    expect(bfwd.length).toBe(48); // one opening row per resident per year, 8 x 6
    // exactly one true opening balance per resident; the rest are year restatements
    expect(transactions.filter(t => t.type === "openingBalance").length).toBe(8);
    transactions.filter(t => t.type === "openingBalance")
      .forEach(t => expect(t.note).toBe("Opening balance b/fwd"));
    transactions.filter(t => t.type === "restated")
      .forEach(t => expect(t.amount).not.toBe(undefined));
  });

  test("positive, zero, and negative balances all occur", () => {
    const rows = reconcile(SEED_RESIDENTS, transactions);
    expect(rows.some(r => r.calculated > 0)).toBe(true);
    expect(rows.some(r => r.calculated === 0)).toBe(true);
    expect(rows.some(r => r.calculated < 0)).toBe(true);
  });

  test("reversal balance effects offset the original financial event", () => {
    const rows=[
      {residentId:"r1",date:"2026-01-01",type:"charge",amount:4000},
      {residentId:"r1",date:"2026-01-02",type:"payment",amount:1000},
      {residentId:"r1",date:"2026-01-03",type:"reversal",amount:4000,balanceEffect:-4000},
      {residentId:"r2",date:"2026-01-01",type:"payment",amount:2500},
      {residentId:"r2",date:"2026-01-02",type:"reversal",amount:2500,balanceEffect:2500},
    ];
    expect(calcBal("r1",rows)).toBe(-1000);
    expect(calcBal("r2",rows)).toBe(0);
  });

  test("monthly collections come from payments, not charges", () => {
    const month = "2026-08";
    const charged = transactions.filter(t => t.date.startsWith(month) && t.type === "charge")
      .reduce((s,t) => s + t.amount, 0);
    const paid = transactions.filter(t => t.date.startsWith(month) && t.type === "payment")
      .reduce((s,t) => s + t.amount, 0);
    expect(paid).toBeGreaterThan(0);
    expect(paid).not.toBe(charged);
  });

  test("GateHouse workbook totals are carried through", () => {
    expect(WORKBOOK_GATEHOUSE.estimatedTotal).toBe(365080);
    expect(WORKBOOK_GATEHOUSE.actualTotal).toBe(456479);
    expect(WORKBOOK_GATEHOUSE.overspend).toBe(91399);
    expect(WORKBOOK_GATEHOUSE_ITEMS).toHaveLength(19);
    expect(WORKBOOK_GATEHOUSE_ITEMS.reduce((sum,item)=>sum+(item.estimated || 0),0)).toBe(WORKBOOK_GATEHOUSE.estimatedTotal);
    expect(WORKBOOK_GATEHOUSE_ITEMS.reduce((sum,item)=>sum+item.actual,0)).toBe(WORKBOOK_GATEHOUSE.actualTotal);
    expect(WORKBOOK_GATEHOUSE_ITEMS.every(item=>item.source.startsWith("GateHouse!row "))).toBe(true);
  });

  test("GateHouse resident receipts use source totals without invented dates", () => {
    const totalFor = projectId => SEED_CONTRIBS.filter(item=>item.projectId===projectId).reduce((sum,item)=>sum+item.amount,0);
    expect(totalFor("p1")).toBe(400000);
    expect(totalFor("p2")).toBe(80000);
    expect(SEED_CONTRIBS.every(item=>!item.date && item.source)).toBe(true);
    expect(SEED_REMINDERS).toEqual([]);
  });

  test("Payment Details references remain review evidence and are not ledger imports", () => {
    const references = WORKBOOK_PAYMENT_REFERENCES.filter(item=>item.kind==="payment reference");
    const expenses = WORKBOOK_PAYMENT_REFERENCES.filter(item=>item.kind==="expense note");
    expect(references).toHaveLength(2);
    expect(references.reduce((sum,item)=>sum+item.amount,0)).toBe(58000);
    expect(references.every(item=>item.status.startsWith("Unmatched") && item.source.startsWith("Payment Details!"))).toBe(true);
    expect(expenses.reduce((sum,item)=>sum+item.amount,0)).toBe(1400);
  });

  test("reminder schedule dates handle due-day, leap-year, and year transitions", () => {
    expect(reminderSchedule(new Date(2024,1,24))).toEqual({
      levyISO:"2024-02-25",eomISO:"2024-02-29",nextUp:{type:"levy",iso:"2024-02-25"},
    });
    expect(reminderSchedule(new Date(2024,1,26)).nextUp).toEqual({type:"overdue",iso:"2024-02-29"});
    expect(reminderSchedule(new Date(2024,11,31)).nextUp).toEqual({type:"overdue",iso:"2024-12-31"});
    expect(reminderSchedule(new Date(2025,0,1)).nextUp).toEqual({type:"levy",iso:"2025-01-25"});
  });

  test("duplicate charges are detected within the same month only", () => {
    const rows = [{residentId:"r1", type:"charge", date:"2025-01-25"}];
    expect(hasDuplicateCharge(rows, "r1", "2025-01-31")).toBe(true);
    expect(hasDuplicateCharge(rows, "r1", "2025-02-01")).toBe(false);
    expect(hasDuplicateCharge(rows, "r2", "2025-01-31")).toBe(false);
  });

  test("removing a resident cascades to transactions and contributions", () => {
    const result = removeResidentData("r1", [{id:"r1"},{id:"r2"}], [{residentId:"r1"},{residentId:"r2"}], [{residentId:"r1"},{residentId:"r2"}]);
    expect(result.residents).toEqual([{id:"r2"}]);
    expect(result.transactions).toEqual([{residentId:"r2"}]);
    expect(result.contribs).toEqual([{residentId:"r2"}]);
  });

  test("backup validation requires resident and transaction arrays", () => {
    expect(isValidBackup({residents:[], transactions:[]})).toBe(true);
    expect(isValidBackup({residents:[]})).toBe(false);
    expect(isValidBackup(null)).toBe(false);
  });

  test("Kenyan phone numbers are normalized only when valid", () => {
    expect(normaliseKenyanPhone("0712345678")).toBe("254712345678");
    expect(normaliseKenyanPhone("+254 712 345 678")).toBe("254712345678");
    expect(normaliseKenyanPhone("071234567")).toBeNull();
    expect(normaliseKenyanPhone("0722000001")).toBe("254722000001");
    expect(normaliseKenyanPhone("")).toBeNull();
  });

  test("WhatsApp links encode messages and reject missing contacts", () => {
    expect(waLink("0712345678", "Due KES 4,000 & thanks")).toBe(
      "https://wa.me/254712345678?text=Due%20KES%204%2C000%20%26%20thanks"
    );
    expect(waLink("", "Hello")).toBeNull();
  });

  test("legacy storage migration backs up data and never overwrites v6 records", () => {
    const values = new Map([
      ["lc-r3", JSON.stringify([{id:"resident-old"}])],
      ["lc-t3", JSON.stringify([{id:"transaction-old"}])],
      ["lc-r6", JSON.stringify([{id:"resident-current"}])],
    ]);
    const storage = {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
    };

    expect(migrateLegacyStorage(storage)).toBe(1);
    expect(JSON.parse(storage.getItem("lc-r6"))).toEqual([{id:"resident-current"}]);
    expect(JSON.parse(storage.getItem("lc-t6"))).toEqual([{id:"transaction-old"}]);
    expect(JSON.parse(storage.getItem("lc-r3"))).toEqual([{id:"resident-old"}]);
    expect(JSON.parse(storage.getItem("lc-migration-backup-6")).values["lc-t6"]).toBe(JSON.stringify([{id:"transaction-old"}]));
    expect(migrateLegacyStorage(storage)).toBe(0);
  });

  test("legacy migration stops on malformed records without replacing the source", () => {
    const original = "not-json";
    const values = new Map([["lc-r3", original]]);
    const storage = {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
    };
    expect(() => migrateLegacyStorage(storage)).toThrow("Legacy data at lc-r3 is not valid JSON");
    expect(storage.getItem("lc-r3")).toBe(original);
    expect(storage.getItem("lc-r6")).toBeNull();
  });
});
