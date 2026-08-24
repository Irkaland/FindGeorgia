# RBAC

| Role | Case access | Tip access | Audit/settings |
|---|---|---|---|
| `ADMIN` | Create, read, edit, preview, publish/unpublish, found/close, archive, source/media edit | Read and moderate | Read audit |
| `TIP_REVIEWER` | None | Read and moderate | Own session settings only |
| `SUPER_ADMIN` | All administrator capabilities | Read and moderate | Audit, security, and account-management permissions |

Permissions are loaded from the database on each authorization check. An active session loses access when the user is disabled, the session is revoked, or its role assignment is removed. MFA verification is mandatory for every active role.

The legacy owner column is not an authorization boundary. There is no family/public role and no object-ownership path.
