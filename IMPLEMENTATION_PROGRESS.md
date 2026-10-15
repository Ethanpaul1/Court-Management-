# Implementation Progress

## Completed in this continuation

- Added server-linked resident accounts. Only an estate owner can create a resident member, and the server validates the resident ID against that estate.
- Scoped `/api/me`, resident details, statements, transactions, receipts, search, and account routes to the authenticated resident. Residents cannot list estate residents, access reports, create members, create reminders, or write estate data.
- Kept viewer accounts read-only and restricted their app navigation to Dashboard, Reports, and Provider.
- Added real HTTP API integration tests using a disposable JSON store for resident isolation, viewer permissions, unauthenticated access, owner workflows, and account mapping.
- Added Provider payment history with whole-KES validation, method, reference, billing period, notes, idempotency, recorder attribution, and explicit unverified status. Invoices are not present, so payable is not inferred.
- Added Provider payment persistence to the API, offline storage, and JSON backup/restore. Added annual Provider payment reporting/export.
- Made posted financial transactions immutable through bulk data sync. Added a reason-required append-only reversal/correction route with original/new values, actor, timestamp, correction ID, and recalculated balance.
- Replaced statement delete controls with a correction/reversal modal. Balances, statements, receipts, exports, and reconciliation display signed reversal adjustments.
- Disabled resident removal in the UI when posted transactions exist. Kept mobile sign-out visible.
- Documented owner-controlled manual resident account linking and deployment limitations in README.

## Verification so far

- Frontend: 24 tests pass.
- Backend HTTP integration: 14 tests pass.
- `npm run build`, `node --check server/index.js`, and `git diff --check` pass.
- Browser checks confirmed resident-only view, Provider payment persistence after reload, provider reporting, and a reasoned transaction reversal. At 390px, sign-out is visible and the document has no horizontal overflow.
- The temporary QA API process, database, and backups were removed. Workspace extraction artifacts were left untouched.
- The original `.xlsx` is not present. Workbook verification remains based on extracted workspace artifacts and is not independent.

## Remaining work

1. Add an in-app owner member invitation/linking screen; linking currently requires the documented owner API call.
2. Add provider invoice records and invoice-to-payment reconciliation. Until then, outstanding provider payable remains unavailable.
3. Add an audit-history UI and clearer provenance/recorded-by details on transaction receipts.
4. Finish statement period summaries and export behavior for filtered periods; PDF download is not implemented (browser print is available).
5. Expand reports with resident/unit/date/type filters and project/provider expense reconciliation.
6. Add external messaging delivery only after a provider and server-side credentials are configured; reminders currently log/prep messages only.
7. Independently verify against the original workbook when it is available.
8. Do not deploy publicly until managed persistence, HTTPS/secrets, owner provisioning controls, backup policy, and deployment security review are complete.