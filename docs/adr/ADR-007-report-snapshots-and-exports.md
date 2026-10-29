# ADR-007: Report snapshots and multi-format export

- **Status:** Proposed (design fixed Phase 0; implemented Phase 1, FA-D/FA-E)
- **Date:** 2026-10-29
- **FDD references:** ACC-008, FR-001..FR-009, EX-001..EX-018, AT-023..AT-028, AT-035, F-FIN-005

## Context

P&L, balance sheet, cash flow, trial balance and the report catalog must be produced from the
posted ledger, frozen as immutable versions, and exported to genuine XLSX, searchable PDF and
editable DOCX from **one** canonical result with exact reconciliation across formats.

## Decision

1. **One calculation engine** (`modules/reports/application/statement-engine`) produces a
   `ReportResult` JSON tree (rows, columns, decimal-string values, validations, provenance,
   metadata) per the E.11 envelope. Renderers (HTML, XLSX, PDF, DOCX) are pure functions of a
   `ReportResult` and may not query the database.
2. **Report runs are frozen rows** (`report_runs`: scope, filters, mapping hash, journal
   high-watermark, policy version, status, canonical JSON, checksum). A later GL posting never
   mutates an existing run; regenerating creates a new version with a link to the previous one.
3. **Exports are artifacts** (`report_artifacts`: run, format, object key, sha256, size,
   created_by, expires_at, revoked_at) rendered by `apps/worker` from the frozen run, stored in
   tenant-prefixed object storage, downloaded through expiring, permission-checked links.
   Permission is re-evaluated at download time (AT-043).
4. **Renderer libraries:** `exceljs` for `.xlsx` (typed numeric cells, formulas for subtotals,
   frozen headers, formula-injection escaping), `docx` for `.docx` (real tables, headings,
   repeated header rows), server-side PDF through a headless Chromium (Playwright) rendering the
   same HTML renderer with print CSS and RTL support — selectable text, page numbers,
   `Page X of Y`. Each library choice is re-verified against AT-025..AT-028 in Phase 1 and may be
   swapped if a check fails.
5. **Consistency guard** (EX-007): before an artifact is published, an independent parser
   (`exceljs` reader, `pdf-parse`, `docx` reader) extracts totals and compares them to the
   canonical digest; mismatch fails the job.
6. **Decimal end-to-end:** values are decimal strings in `ReportResult`; XLSX cells are written
   from `decimal.js` → number only at the final cell write with precision ≤ 15 significant
   digits asserted, else the cell is written as text with a validation warning.

## Consequences

- AT-024 (on-screen = XLSX = PDF = DOCX) is testable by construction.
- Report history is immutable and auditable; restatements are explicit.
- Phase 0 contributes the `Money`/decimal primitives and the worker/artifact storage scaffold.
