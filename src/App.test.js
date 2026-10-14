import { buildSeedTxns, calcBal, hasDuplicateCharge, isValidBackup, removeResidentData } from "./App";

describe("estate data rules", () => {
  test("seed balances match the presentation ledger", () => {
    const transactions = buildSeedTxns();
    expect(calcBal("r1", transactions)).toBe(4000);
    expect(calcBal("r2", transactions)).toBe(0);
    expect(calcBal("r3", transactions)).toBe(4000);
    expect(calcBal("r4", transactions)).toBe(4000);
    expect(calcBal("r5", transactions)).toBe(32000);
    expect(calcBal("r6", transactions)).toBe(0);
    expect(calcBal("r7", transactions)).toBe(0);
    expect(calcBal("r8", transactions)).toBe(4000);
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
