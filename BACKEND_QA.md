# Backend QA

Run:

```powershell
npm test
npm run build
```

The automated suite verifies:

1. Clean migration and simplified active roles.
2. Removed self-service enrollment/case routes.
3. MFA and server-side admin/reviewer permissions.
4. Admin-created drafts remain private.
5. Preview and public DTOs omit every source/admin/private field.
6. Publication requires a sanitized photo and reviewed source data.
7. Direct admin edits update published content and audit history.
8. Found minimization and close/archive removal.
9. Private tip intake only for published cases, encrypted contact, and reviewer moderation.
10. CSRF, transition guards, append-only audit, and unsafe production configuration fail closed.
11. Full create → photo → publish → tip → found → close → archive persistence across restart.
12. Encrypted backup validation and applied restore.
13. Static Sites worker path/API fallback safety.

Browser QA should cover the Georgian/English public home, filter panel, published case, private tip modal, Found page, MFA login, admin dashboard, create/edit form, internal-source boundary, preview, confirmations, tips, archive, audit, and responsive layouts.
