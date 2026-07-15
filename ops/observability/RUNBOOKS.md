# Production alert runbooks

These runbooks use request IDs, trace IDs, connection IDs, message IDs, and the
bounded metrics exposed by `/metrics`. Never paste cookies, JWTs, presigned
URLs, raw WebSocket payloads, or asset contents into incidents.

## Service unavailable

1. Check `/health/live`; if it fails, inspect the latest `application.starting`
   or fatal startup event.
2. Check `/health/ready`. `schema_revision_mismatch` requires completing or
   rolling back the pre-deploy migration before traffic is restored.
3. Confirm the persistent disk is mounted at `/var/data` and the instance is
   still single-writer.
4. Roll back the application only when its expected schema revision is
   compatible with the database. Otherwise restore a verified backup to a new
   path and switch after validation.

## High HTTP error rate

1. Group `http.request.failed` and `http.request.completed` events by route and
   service version; do not group on raw paths.
2. Follow a representative request ID into its trace and SQL spans.
3. Check database readiness and asset-operation failures for a shared cause.
4. Mitigate with a version rollback only after confirming schema compatibility.

## High HTTP latency

1. Compare route-level p95 latency and SQL span duration.
2. Check SQLite writer contention, disk capacity, and `busy_timeout` failures.
3. Check R2 operation latency separately; the readiness endpoint intentionally
   does not perform remote dependency calls.
4. Reduce load or disable the affected non-critical operation before scaling;
   file-backed SQLite must remain single-writer.

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
4. Do not delete database metadata until storage deletion succeeds. Reconcile
   orphans with the administrative storage script after the incident.

## Browser error burst

1. Compare the `current` and `other` release labels and the deployment start
   time. The endpoint intentionally rejects arbitrary metric-cardinality labels.
2. Inspect `browser.error.reported` events by path and error fingerprint. The
   intake contains no query string, application state, cookie, or protocol
   payload.
3. Reproduce with the exact release, then correlate nearby HTTP request IDs and
   WebSocket connection/message IDs.
4. Roll back only after confirming database migration compatibility.

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
