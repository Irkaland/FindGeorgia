# Observability

The API emits one JSON record per completed HTTP request with request ID, method, route path, status, duration, and severity. It never logs request bodies, cookies, authorization data, tip descriptions, exact locations, reporter contacts, encryption material, or presigned URLs. Clients receive the request ID in `x-request-id` and error responses.

Sentry receives unhandled server exceptions with environment, deploy version, request ID, and path; default PII collection is disabled. Render supplies service metrics for request volume, latency, CPU, memory, restarts, PostgreSQL, and workers.

## Health

- `/api/health/live`: process and version only; suitable for an external uptime probe.
- `/api/health/ready`: database query plus provider labels; Render uses this to gate traffic.
- `npm run check:production`: operator check for production config, PostgreSQL migrations, audit triggers, R2 buckets, and ClamAV.

## Minimum alerts

- API 5xx rate, readiness failures, restart loop, p95/p99 latency, and pool connection errors.
- Authentication failures, MFA failures, rate-limit spikes, CSRF/origin rejections, and unusual signed-link volume.
- Upload scan unavailable/infected outcomes and old quarantine objects.
- Worker stopped, job retry growth, terminal failed jobs, notification failures, and privacy-review reminder backlog.
- PostgreSQL storage/connections/replication/PITR status and R2 access errors.

Every incident timeline should include deploy version, request IDs, affected resource IDs, audit-event IDs, and recovery verification. See [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) for the existing human response policy.
