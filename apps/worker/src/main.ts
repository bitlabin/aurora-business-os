/**
 * Background worker (FDD §3.3): outbox relay and job consumers.
 *
 * Phase 0 status: scaffold only. The API already writes every state change to `outbox_events`
 * inside the same transaction; the first consumers (report rendering, connector publishing)
 * arrive in Phase 1 together with the BullMQ queues they need. Nothing here pretends to run.
 */
export const WORKER_STATUS = 'phase-0-scaffold' as const;

if (require.main === module) {
  console.warn(`aurora worker: ${WORKER_STATUS} — no consumers registered yet (Phase 1)`);
}
