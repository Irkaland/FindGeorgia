# Simplified Admin-Managed Product Model

This refactor deliberately trades self-service breadth for clear authority and lower privacy risk.

- Find Georgia is the publisher of record inside the product.
- Only administrators create and change cases.
- Source provenance is required but internal.
- Public visitors browse, search, filter, share, make posters/QR codes, and submit private tips.
- Case truth is represented by one six-state lifecycle.
- Preview uses the public serializer/component, so internal metadata cannot be accidentally shown.
- The old family relationship/update/evidence data is retained only as non-authoritative migration history.

The implementation remains an Alpha: its security controls are functional locally, but production hosting, operational governance, and legal/privacy readiness require additional work described in `SECURITY.md` and `ARCHITECTURE.md`.
