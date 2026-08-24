# UI / UX QA

## Public

- Georgian and English home pages clearly say “Missing Persons in Georgia”.
- Primary actions are browse/search; there is no self-service missing-person submission or account area.
- Filters cover name/ID, region, municipality, sex, age range, missing year, and public status.
- Active cards and detail pages say “Published by Find Georgia”.
- A published case supports copy/share, Facebook/Messenger, poster/QR, and a private structured tip.
- Tip contact, exact locations, attachments, source details, and admin notes never appear publicly.
- Found/Closed pages are minimized and do not offer tip/poster actions.

## Admin

- MFA login is required.
- Navigation contains Dashboard, Cases, New Case, Tips, Archive, Audit, and Settings, restricted by server permissions.
- New cases always begin as Draft.
- The editor separates public fields from a visually distinct internal source/admin-notes panel.
- Preview renders the public case component and contains no internal source/admin fields.
- Publish, unpublish, found, close, and archive use confirmation dialogs and produce audit entries.
- Archived cases are separate, non-public, and read-only.

## Responsive/accessibility

- Verify at 1440px desktop, about 820px tablet, and 390px mobile.
- No document-level horizontal overflow; admin navigation may scroll horizontally on mobile.
- All dialogs trap focus, close on Escape, restore focus, and have accessible labels.
- All interactive controls have visible focus states, and state is not communicated by color alone.

Automated security/integration coverage is documented in `BACKEND_QA.md`; visual browser results should be recorded after each material UI change.
