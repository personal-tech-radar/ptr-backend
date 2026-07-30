---
name: auth-oauth-module
description: Implement or review JWT authentication, opaque refresh tokens, password login, hybrid API-key/JWT guards, role-based access control, current-user decorators, or OTP session flows in this NestJS service. Use for changes under src/auth or when protecting routes for human and machine clients. Do not use for API-key-only routes that need no JWT or roles.
---

# Authentication and Authorization

Use the existing auth module and neighboring implementation as the primary reference. Preserve backward compatibility for API-key clients.

## Token design

- Use short-lived JWT access tokens with `{ sub, email, role }`.
- Use high-entropy opaque refresh tokens and persist only their SHA-256 hashes.
- Rotate refresh tokens on use, revoke them on logout, and bulk-revoke them after password reset.
- Use bcrypt only for passwords; use SHA-256 for high-entropy lookup tokens.
- Read required secrets through a helper that throws when unset.
- Register JWT asynchronously so secret validation happens during dependency injection.
- Reject soft-deleted users during JWT validation.

## Guards and roles

- Use the existing API-key guard when JWT is unnecessary.
- For dual-access routes, use a hybrid guard that accepts a valid API key and otherwise delegates to JWT authentication.
- Apply the roles guard after authentication and read roles from route metadata.
- Use `@CurrentUser()` instead of exposing the raw request.
- Keep authentication and authorization logic out of controllers.

## OTP sessions

- Issue a random, short-lived, one-time session token after password validation.
- Consume it after OTP validation.
- Use Redis instead of memory for multi-instance or high-volume deployments.

## Verification

- Inspect `package.json` before proposing dependencies.
- Test role success and denial.
- Test refresh rotation, reuse rejection, expiry, logout revocation, and password-reset revocation.
- Document protected routes in Swagger and add new variables to `.env.example`.
