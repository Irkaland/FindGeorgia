# API

All mutations require the same-origin CSRF token. Admin endpoints additionally require an authenticated MFA session and the named permission.

## Authentication

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/csrf` | Initialize CSRF protection |
| POST | `/api/auth/login` | Admin/reviewer login with MFA |
| GET | `/api/auth/me` | Current server-held role/permissions |
| POST | `/api/auth/logout` | Revoke current session |
| GET/DELETE | `/api/auth/sessions[...]` | Inspect/revoke own sessions |

Self-service registration, email enrollment, and phone enrollment return 404.

## Public cases

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/cases/public` | Published/found search with status, text, region, municipality, sex, age, and year filters |
| GET | `/api/cases/public/:publicCaseId` | Explicit `PublicCaseDTO` |
| GET | `/api/cases/public-media/:publicCaseId` | Sanitized media for currently published cases |
| POST | `/api/tips` | Private tip intake for a published case |
| POST | `/api/privacy-requests` | Private privacy request |

## Admin cases

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/api/cases/admin` | `CASE_READ_ALL` / `CASE_ADMIN_CREATE` |
| GET/PATCH | `/api/cases/admin/:id` | `CASE_READ_ALL` / `CASE_ADMIN_EDIT` |
| GET | `/api/cases/admin/:id/preview` | `CASE_READ_ALL`; returns only `PublicCaseDTO` fields and `noindex` |
| POST | `/api/cases/admin/:id/public-image` | `EVIDENCE_UPLOAD` (public image sanitation capability) |
| POST | `/api/cases/admin/:id/publish` | `CASE_ADMIN_PUBLISH` |
| POST | `/api/cases/admin/:id/unpublish` | `CASE_ADMIN_PUBLISH` |
| POST | `/api/cases/admin/:id/found` | `CASE_ADMIN_EDIT` |
| POST | `/api/cases/admin/:id/close` | `CASE_ADMIN_EDIT` |
| POST | `/api/cases/admin/:id/archive` | `CASE_ADMIN_ARCHIVE` |

## Tip/audit administration

`GET /api/tips/moderation`, `GET /api/tips/:id`, `POST /api/tips/:id/moderate`, signed attachment access/download, `GET /api/audit`, and `GET /api/moderation/bootstrap` are role-scoped.
