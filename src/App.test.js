import { buildSeedTxns, calcBal, hasDuplicateCharge, isValidBackup, removeResidentData } from "./App";

describe("estate data rules", () => {
  test("2026 closing balances match the spreadsheet", () => {
    const transactions = buildSeedTxns();
    expect(calcBal("r1", transactions)).toBe(0);
    expect(calcBal("r2", transactions)).toBe(0);
    expect(calcBal("r3", transactions)).toBe(0);
    expect(calcBal("r4", transactions)).toBe(4000);
    expect(calcBal("r5", transactions)).toBe(33000);
    expect(calcBal("r6", transactions)).toBe(-8000);
    expect(calcBal("r7", transactions)).toBe(-12000);
    expect(calcBal("r8", transactions)).toBe(4000);
  });

  test("2026 year-start opening balances carry forward from the 2025 closing", () => {
    const transactions = buildSeedTxns();
    const close2025 = id => calcBal(id, transactions.filter(t => t.date < "2026-01-01"));
    expect(close2025("r1")).toBe(4000);
    expect(close2025("r2")).toBe(0);
    expect(close2025("r3")).toBe(8000);
    expect(close2025("r4")).toBe(0);
    expect(close2025("r5")).toBe(32000);
    expect(close2025("r6")).toBe(0);
    expect(close2025("r7")).toBe(0);
    expect(close2025("r8")).toBe(0);
  });

  test("seed covers 2021–2026 spreadsheet years and posts 2026 charges", () => {
    const transactions = buildSeedTxns();
    expect(transactions.some(t => t.date.startsWith("2025"))).toBe(true);
    expect(transactions.some(t => t.date.startsWith("2026"))).toBe(true);
    // January–September 2026 levies exist for every one of the eight units
    const chargeCount = transactions.filter(t => t.date.startsWith("2026") && t.type === "charge").length;
    expect(chargeCount).toBe(72);
    // Excel serials were converted to ISO dates
    expect(transactions.some(t => t.date === "2026-01-25")).toBe(true);
    expect(transactions.some(t => t.date === "2026-10-08")).toBe(true);
  });

  test("duplicate charges are detected within the same month only", () => {
    const transactions = [{residentId:"r1", type:"charge", date:"2025-01-25"}];
    expect(hasDuplicateCharge(transactions, "r1", "2025-01-31")).toBe(true);
    expect(hasDuplicateCharge(transactions, "r1", "2025-02-01")).toBe(false);
    expect(hasDuplicateCharge(transactions, "r2", "2025-01-31")).toBe(false);
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
});
