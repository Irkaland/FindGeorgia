# State machines

The authoritative admin case lifecycle remains:

```text
DRAFT -> PUBLISHED -> UNPUBLISHED -> PUBLISHED
                   \-> FOUND -> CLOSED -> ARCHIVED
```

The server validates every transition. Publication requires a public photo, bilingual public description, reviewed source type, and source note. `FOUND` immediately changes indexing to `NOINDEX`, minimizes the public DTO, and schedules a privacy-review reminder. `CLOSED` stays minimally public; `ARCHIVED` is private and read-only.

Tips use `NEW`, `REVIEWED`, `IMPORTANT`, `FORWARDED`, `SPAM`, `FRAUD_SUSPECTED`, and `CLOSED`. Rule-assisted signals can route a tip to fraud review, but human staff retain the moderation decision.

Privacy requests use `SUBMITTED`, `UNDER_REVIEW`, `NEEDS_INFORMATION`, `APPROVED`, `REJECTED`, and `COMPLETED`. Every status change writes history and an audit event.

Concurrent case transitions acquire a database row lock. An exact replay of the current target is successful but produces no new history; conflicting transitions are re-evaluated against the locked current row and rejected when invalid.
