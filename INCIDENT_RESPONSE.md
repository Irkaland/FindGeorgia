# Incident Response — Alpha Runbook

This is an operational starting point, not a substitute for an approved organization-wide plan. Legal notification periods and named responders remain TBD.

## Severity

- **SEV-1:** public/private data exposure, stolen privileged session/key, evidence-store access, destructive compromise, or active extortion/abuse affecting a case.
- **SEV-2:** authorization bypass attempt with credible impact, malware/scanner failure, sustained account takeover, audit/backup integrity concern.
- **SEV-3:** contained abuse, rate-limit anomaly, failed job/provider, or suspicious login without demonstrated access.

## Immediate response

1. Protect people first. Do not contact a suspected attacker or expose reporter/family details.
2. Assign incident commander, security lead, communications/privacy lead, and scribe; use a restricted channel.
3. Record UTC timestamps and request IDs. Preserve database, audit, sensitive-access, proxy, identity-provider, storage, and deployment logs.
4. Contain with the narrowest safe action: revoke sessions, disable affected accounts, remove a case from publication through the audited workflow, rotate an exposed key, or isolate a service.
5. Do not delete evidence or mutate audit rows. Take an encrypted snapshot before major recovery changes where safe.
6. Determine affected people, data classes, time range, access method, persistence, and whether private objects were downloaded.
7. Engage counsel/privacy leadership for notification and law-enforcement decisions. Do not improvise legal disclosures.

## Credential/key events

- Session suspected: revoke the DB session(s), disable the user if needed, inspect sensitive-access logs, then require reauthentication/MFA.
- Signing/encryption secret suspected: stop affected traffic, rotate via secret manager, revoke sessions and outstanding links, re-encrypt sensitive fields under a dedicated migration plan, and invalidate old backups/keys per policy.
- Backup key suspected: quarantine backup access, rotate, create new snapshots, and determine whether old encrypted material was exfiltrated.

## Data exposure events

Verify the serializer/route and affected resource IDs without copying sensitive payloads into general tickets. Move Disputed/Suspended/Found/Closed cases through audited states rather than editing public files directly. For indexed content, initiate external search-engine/cache removal after the application state is noindex/unavailable.

## Recovery and closure

- Restore only from an authenticated snapshot after dry-run validation and integrity check.
- Verify authentication, role revocation, public DTO minimization, evidence access, tip privacy, audit append-only behavior, and jobs before reopening.
- Monitor for recurrence; document root cause, contributing controls, affected records, notifications, and corrective owners/dates.
- Conduct a blameless review. Add a regression test for every code-level incident cause.

## Required external setup

On-call roster, secure communications, SIEM alerts, provider contacts, insurer/counsel contacts, regulatory matrix, evidence-handling policy, public/family communications templates, and quarterly tabletop exercises are not implemented in code.
