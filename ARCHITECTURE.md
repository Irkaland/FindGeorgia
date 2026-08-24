# Find Georgia Secure Admin-Managed Alpha

## Product boundary

Find Georgia is a curated missing-persons public information platform. Visitors can browse published cases, search/filter, share a case, generate a poster/QR code, and submit a private tip. Only authenticated administrators create or change cases.

There is no public registration, case ownership, self-service submission, evidence workflow, reconfirmation, or public “mark found” action.

## Runtime

```text
React/Vite public + admin UI
        │ same-origin JSON, CSRF token, HttpOnly session
        ▼
Express API
  ├─ admin case CRUD, preview, publication and archive actions
  ├─ explicit PublicCaseDTO / AdminCaseDTO serializers
  ├─ private public-tip intake and moderation
  ├─ MFA, RBAC, rate limits, bot check, signed private downloads
  └─ append-only audit and background jobs
        │
        ├─ SQLite alpha database
        ├─ sanitized public media store
        └─ private attachment store
```

## Authoritative lifecycle

`DRAFT → PUBLISHED → UNPUBLISHED → PUBLISHED`, `PUBLISHED → FOUND → CLOSED → ARCHIVED`, and `DRAFT/UNPUBLISHED → ARCHIVED`.

The server validates every transition. `PUBLISHED` requires a sanitized public photo, bilingual public description, and reviewed internal source metadata. `FOUND` immediately minimizes the public DTO. `ARCHIVED` removes public access and is read-only.

## Deployment boundary

The current Node/Express/SQLite API is the authoritative runtime. The included Sites worker packages the static frontend only and cannot host this backend without a D1/R2/auth port. Do not treat a static Sites upload as a working production deployment.
# Production migration note (2026-08-24)

The production target is now split into an OpenAI Sites frontend, a separately hosted multi-instance Express API, a dedicated worker, managed PostgreSQL, private ClamAV, and separate R2 buckets. The earlier SQLite/filesystem design remains the local adapter only. See `DEPLOYMENT.md` and `PRODUCTION_READINESS.md`; this architecture has not yet been deployed to live providers.
