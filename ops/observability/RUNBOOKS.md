# Production alert runbooks

These runbooks use request IDs, trace IDs, connection IDs, message IDs, and the
bounded metrics exposed by `/metrics`. Never paste cookies, JWTs, presigned
URLs, raw WebSocket payloads, or asset contents into incidents.

## Service unavailable

1. Check `/health/live`; if it fails, inspect the latest `application.starting`
   or fatal startup event.
2. Check `/health/ready`. `schema_revision_mismatch` requires completing a
   reviewed migration or recovering to a verified Neon branch before traffic
   is restored.
3. Confirm `DATABASE_MIGRATION_URL` selects the intended schema-owner
   connection and `DATABASE_URL` selects the intended runtime role, without
   printing either value. Confirm Neon is available.
4. Roll back the application only when its expected Alembic head is compatible
   with the database. Otherwise recover to a new Neon branch and switch after
   validation.

## High HTTP error rate

1. Group `http.request.failed` and `http.request.completed` events by route and
   service version; do not group on raw paths.
2. Follow a representative request ID into its trace and SQL spans.
3. Check database readiness and asset-operation failures for a shared cause.
4. Mitigate with a version rollback only after confirming schema compatibility.

## High HTTP latency

1. Compare route-level p95 latency and SQL span duration.
2. Check PostgreSQL pool saturation, Neon compute availability, and SQL spans.
3. Check R2 operation latency separately; the readiness endpoint intentionally
   does not perform remote dependency calls.
4. Reduce load or disable the affected non-critical operation before changing
   pool or instance limits.

## WebSocket failures

1. Separate connection rejection reasons from `outcome="error"`; authentication,
   membership, size, and rate-limit rejections are expected security controls.
2. Correlate connection ID to message ID and trace/request ID where available.
3. Check database persistence failures before reconnecting clients. The server
   deliberately refuses an in-memory fallback.
4. Verify client and server protocol versions if failures began after deploy.

## Asset operation failures

1. Identify the operation label: presign, confirmation, verification, or
   cleanup. Use structured event names for detail without exposing object keys.
2. Run the R2 storage diagnostic out of band; do not add remote R2 calls to
   `/health/ready`.
3. For confirmation failures, preserve the durable upload intent and inspect
   object metadata/hash validation before retrying.
4. The current delete path keeps database metadata when R2 deletion fails, so
   the request can be retried without losing the authoritative object key.
   Reconcile historical or independently created orphans with the
   administrative storage script after the incident.
5. `r2_delete_failed` requires object-delete permission;
   `ListObjectsV2 AccessDenied` requires bucket-list permission. Do not repeat
   smoke tests while cleanup is denied.

## Browser error burst

1. Compare the `current` and `other` release labels and the deployment start
   time. The endpoint intentionally rejects arbitrary metric-cardinality labels.
2. Inspect `browser.error.reported` events by path and error fingerprint. The
   intake contains no query string, application state, cookie, or protocol
   payload.
3. Reproduce with the exact release, then correlate nearby HTTP request IDs and
   WebSocket connection/message IDs.
4. Roll back only after confirming database migration compatibility.

## Database errors or saturation

1. Separate failed operation labels from pool saturation; neither label contains
   a query, table, tenant, or exception string.
2. Correlate the affected request or WebSocket message to its SQL span and
   structured exception. Check readiness, Neon availability, connection
   limits, and pool checkout timeouts.
3. Do not raise pool limits until the Neon branch connection budget and
   concurrent Render instances are understood.
4. Shed non-critical work or roll back only after verifying schema compatibility.

## Stale pending uploads

1. Check pending count and oldest age, then group asset operation failures by
   bounded operation and outcome.
2. Use the authenticated R2 smoke test out of band. Do not copy object keys or
   presigned URLs into incident notes.
3. Reconcile expired intents with the existing cleanup operation; preserve a
   recent intent until object existence and ownership have been verified.

## Email delivery failures

1. Compare operation and outcome only; recipient, subject, body, and reset links
   are intentionally absent from metrics and logs.
2. Verify provider configuration and status without printing API keys.
3. Confirm password-reset and address-change delivery with a test account, then
   retain the provider delivery identifier in the restricted incident system.

## Authentication or rate-limit anomaly

1. Compare password, token, and OAuth outcomes with limiter rejection trends.
2. Query normalized audit actions by time window and outcome. Do not aggregate
   metrics by IP address, username, user ID, or token reason text.
3. Escalate sustained distributed failures; tune a limiter only after ruling out
   credential stuffing or an unhealthy login dependency.

## Telemetry exporter missing

1. Verify the OTLP endpoint and headers exist in Render without printing them.
2. Check the collector/backend health and a known trace from browser to DB/R2.
3. Treat this alert as loss of diagnostic evidence, not proof that user traffic
   is unavailable. Use readiness and synthetic checks for availability paging.

## Audit access

Session audit records are owner-only and cursor paginated. Every successful or
denied read is itself recorded. Export only the normalized envelope; IP address,
user agent, legacy duplicate fields, and raw payloads are intentionally omitted.
The application database is the transactional near-term copy, not the required
append-only external archive.

## Audit-event retention

Security events use schema version 1 and share the transaction of the state
change they describe. The daily retention task deletes events older than
`AUDIT_RETENTION_DAYS` (365 by deployment default). Any legal-hold or longer
retention requirement must be implemented in the external log/archive system
before reducing this window.

## Incident closure

Record start/end time, impact, release version, triggering alert, representative
correlation IDs, mitigation, and follow-up owner. Link evidence rather than
copying sensitive payloads. Validate the alert has cleared and add a regression
test or runbook correction before closing.
