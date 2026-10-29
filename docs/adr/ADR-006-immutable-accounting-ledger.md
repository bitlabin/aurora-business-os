# ADR-006: Immutable double-entry ledger

- **Status:** Proposed (design fixed in Phase 0; implemented Phase 1, FA-A). Accounting
  policies themselves are **GATED** on controller sign-off (open question 3).
- **Date:** 2026-10-29
- **FDD references:** ACC-001..ACC-014, §17.3, FA-001..FA-010, E.12, AT-001..AT-004, AT-021

## Context

The FDD requires a balanced, immutable, per-entity double-entry ledger that is the authoritative
source for every financial statement, with reversal-based correction, idempotent posting, period
locks and exact decimal arithmetic. Order-to-cash, procure-to-pay, expenses, POS, projects and
inventory all post through it. Getting this shape wrong is the most expensive mistake the
project could make, so the design is fixed before any transactional module is written.

## Decision

1. **Tables:** `journal_headers` (`tenant_id`, `company_id`, `number`, `status`,
   `posting_date`, `document_date`, `period_id`, `currency`, `fx_rate`, `fx_source`,
   `source_type`, `source_id`, `posting_key` UNIQUE, `reversal_of_id`, `reversed_by_id`,
   `memo`, `policy_version`, `approval_id`, `posted_by`, `posted_at`) and `journal_lines`
   (`journal_id`, `line_no`, `account_id`, `debit_base`, `credit_base`, `amount_txn`,
   `currency`, dimension columns, `counterparty_party_id`, `reference`). Composite FKs include
   `tenant_id` and `company_id` so a line can never reference an account of another entity.
2. **Database-enforced invariants** (migration SQL, not only application code):
   - `CHECK (debit_base >= 0 AND credit_base >= 0 AND (debit_base = 0 OR credit_base = 0)
AND (debit_base <> 0 OR credit_base <> 0))`
   - A `DEFERRABLE INITIALLY DEFERRED` constraint trigger on `journal_lines` that, at commit,
     verifies `SUM(debit_base) = SUM(credit_base)` for every posted journal touched in the
     transaction, and that a posted journal has ≥ 2 lines.
   - Triggers that `RAISE EXCEPTION` on `UPDATE`/`DELETE` of a header or line whose status is
     `posted`. The `aurora_app` role has no `DELETE` grant on these tables at all.
   - A trigger rejecting `INSERT` of a posted journal whose `posting_date` falls in a period
     with state `hard_closed` (fiscal periods table, FA-008).
3. **Posting is a command** (`PostJournalCommand`) run inside the request transaction with:
   permission + company scope check → period open check → balance check → insert header +
   lines with status `posted` → `audit_events` → `outbox_events`. Idempotency is a mandatory
   `posting_key` (`Idempotency-Key` header or source-derived key); replay returns the original
   `journal_id`; a different payload under the same key returns `409 IDEMPOTENCY_KEY_REUSED`.
4. **Corrections are reversals:** `ReverseJournalCommand` creates a new posted journal with
   swapped debit/credit lines, links both ways, and requires a reason + approval per policy.
5. **Source-to-ledger registry** (`posting_rules`): typed, effective-dated, per-company rule
   `(source_event_type, policy_version) → account roles` resolved through
   `account_mappings`. Modules never choose accounts directly; they emit a typed accounting
   event, and the ledger module posts.
6. **Money:** `NUMERIC(20,6)`; base amounts rounded to the company currency's minor units at
   posting using a documented rounding mode (`HALF_EVEN` by default, policy-configurable);
   rounding residue goes to a designated rounding account, never discarded (FA-003).
7. **Subledgers** (`ar_open_items`, `ap_open_items`, inventory cost layers) reference the
   posting journal; reconciliation jobs assert subledger = control account per period.

## Consequences

- Statements are computed from `journal_lines` only (FR-001); nothing else is a source of
  financial truth.
- The deferred constraint trigger makes an unbalanced journal impossible to commit even from a
  maintenance script.
- The posting-rule registry means a new industry pack adds rules, not ledger code.
