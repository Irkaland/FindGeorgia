# Data Classification

| Class | Examples | Enforcement |
|---|---|---|
| Public | Published name, age, broad region/municipality, missing date, reviewed description, sanitized photo, case ID | Allowlisted `PublicCaseDTO`; only `PUBLISHED`, plus minimized `FOUND/CLOSED` |
| Internal | Source type/URL/note, verification actor/time, admin notes, unpublished/archive timestamps | `AdminCaseDTO` plus case permissions; excluded from preview/public serializers |
| Private | Tip text, precise sighting location, reporter contact, tip attachments, privacy requests | Encrypted fields, private storage, reviewer permission, signed session-bound downloads |
| Security | Password hashes, MFA secrets, session tokens, signing/encryption keys | Password hashing, encrypted secrets, token hashing, environment secrets; never returned |
| Audit | Actor, role, action, resource, reason, timestamp, request/session context | Append-only triggers and `AUDIT_READ` |

`FOUND/CLOSED` public records retain only the minimal identity/status fields needed to explain that the person has been found. `ARCHIVED`, `DRAFT`, and `UNPUBLISHED` are not public.
