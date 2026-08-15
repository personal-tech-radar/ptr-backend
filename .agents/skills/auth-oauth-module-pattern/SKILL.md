# Skill: auth-oauth-module-pattern

Use this skill when adding authentication and authorization to a service built from this template. It covers JWT-based auth, role-based access control, hybrid guard patterns, and the `@CurrentUser` decorator.

---

## When to Use This Pattern

This pattern is appropriate when:
- The service needs both human users (authenticated via JWT) and machine clients (authenticated via API key).
- Routes require role-based access control.
- A multi-step login flow (e.g., password + OTP) is needed.

For simple API-key-only services, the existing `ApiKeyGuard` in `src/common/guards/` is sufficient — do not add this pattern unless JWT-based auth is actually needed.

---

## Module Structure

```
src/auth/
├── auth.module.ts
├── controllers/
│   └── auth.controller.ts
├── services/
│   ├── auth.service.ts               # Orchestration: login, refresh, me
│   └── session-token-store.service.ts  # In-memory short-lived session tokens (for OTP)
├── strategies/
│   ├── local.strategy.ts             # Passport local (email + password)
│   └── jwt.strategy.ts               # Passport JWT (Bearer token)
├── guards/
│   ├── local-auth.guard.ts
│   ├── jwt-auth.guard.ts
│   ├── hybrid-auth.guard.ts          # Tries API key first, falls back to JWT
│   └── roles.guard.ts                # Reflector-based RBAC
├── decorators/
│   ├── current-user.decorator.ts     # @CurrentUser() param decorator
│   └── roles.decorator.ts            # @Roles(...) method decorator
├── entities/
│   └── refresh-token.entity.ts       # Persisted, hashed, revocable refresh token
├── utils/
│   └── jwt-secret.util.ts            # getJwtSecret() — throws if JWT_SECRET is unset
└── dto/
    ├── login.dto.ts
    ├── login-otp.dto.ts
    ├── refresh-token.dto.ts
    ├── auth-tokens-response.dto.ts
    └── login-step1-response.dto.ts
```

---

## Responsibilities

| Component | Responsibility |
|---|---|
| `AuthService` | Orchestrate login steps, token generation, refresh, and user lookup |
| `SessionTokenStoreService` | Issue and validate short-lived in-memory session tokens for MFA step |
| `LocalStrategy` | Validate email + password via Passport local strategy |
| `JwtStrategy` | Validate Bearer tokens via passport-jwt; load user and reject if soft-deleted |
| `HybridAuthGuard` | Try API key header first; fall back to JWT — allows both machine and human callers on the same route |
| `RolesGuard` | Read `@Roles(...)` from route metadata via `Reflector`; verify user role |
| `@CurrentUser()` | Extract `request.user` set by the auth strategy |

---

## JWT Token Design

- Payload: `{ sub: userId, email: string, role: string }`.
- Two tokens: short-lived `accessToken` (a stateless signed JWT), long-lived `refreshToken` (an opaque, persisted, revocable token — see below).
- JWT strategy rejects soft-deleted users on every authenticated request: `JwtStrategy.validate()` calls `UserQueryService.findById`, which relies on TypeORM's default exclusion of soft-deleted rows (`deletedAt IS NOT NULL`, via `@DeleteDateColumn`) and throws `NotFoundException` for a deleted or missing user; the strategy maps that to `UnauthorizedException`. There is no separate `isActive` flag.
- Read the signing secret through a dedicated helper (e.g. `getJwtSecret()`) that throws if the env var is unset — never fall back to a hardcoded literal. This is the general "fail fast on a missing secret" rule from `AGENTS.md`, applied to JWT signing specifically.
- Register `JwtModule` with `JwtModule.registerAsync({ useFactory: () => ({ secret: getJwtSecret(), ... }) })`, not `JwtModule.register({...})`. The secret helper throws, and `.register()` evaluates its config synchronously at module-definition/import time — that fails module compilation itself (and forces awkward test-setup workarounds to dodge it). `.registerAsync()` with a `useFactory` defers evaluation to DI-instantiation time, where a thrown error surfaces as a normal, testable startup failure.

Required env variables:
```
JWT_SECRET=...
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
```

---

## Refresh Token Design

The refresh token is **not** a second stateless JWT — it is an opaque random value, persisted server-side so it can be looked up and revoked. This is a deliberate choice: a stateless JWT refresh token can't be invalidated before its own expiry (no logout, no forced revocation on password reset), which is unacceptable for a long-lived credential.

- `RefreshToken` entity (`src/auth/entities/refresh-token.entity.ts`): `id`, `userId`, `tokenHash` (SHA-256 hex digest of the raw token — the raw value is never persisted, only ever returned to the client once at issuance), `expiresAt`, `revokedAt` (nullable), `createdAt`.
- Issuance: generate a raw token via `randomBytes(32).toString('hex')`; persist only its SHA-256 hash; return the raw value to the client as `refreshToken`.
- **Rotation on use (one-time-use):** `POST /auth/refresh` looks up the presented token by hash (must be unrevoked and unexpired), immediately marks it `revokedAt`, then issues a brand-new access/refresh pair. A stolen refresh token is usable at most once before both the legitimate client and the attacker's next attempt fail — a signal that credentials were compromised.
- **Server-side revocation on logout:** `POST /auth/logout` looks up the presented token by hash and sets `revokedAt`. Idempotent — an already-revoked or unknown token still reports success.
- **Bulk revocation on password reset:** a successful password reset revokes every outstanding, non-revoked `RefreshToken` row for that user — equivalent to `repo.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() })`. The point of a reset is to lock out anyone with persistent access via the old credentials, not just to change the password hash.
- Hash tokens with plain SHA-256 (`createHash('sha256')`), not bcrypt — this is a lookup key over a high-entropy random value, not a low-entropy password; bcrypt's per-hash salt would make an equality lookup by hash impossible.

---

## Hybrid Guard Pattern

Routes that must accept both machine clients (API key) and human users (JWT) use a single `HybridAuthGuard`. The guard:

1. Checks for `X-API-KEY` header. If present and valid, sets a synthetic user object with a machine-client role and returns `true`.
2. If no API key, delegates to JWT authentication via `super.canActivate()`.
3. Throws `UnauthorizedException` on any invalid credential.

This avoids duplicating guard chains per route and keeps auth transparent to controllers.

---

## Role-Based Access Control

Apply `RolesGuard` after the auth guard. Decorate routes with `@Roles(...)`:

```ts
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles('ADMIN', 'PUBLISHER')
@Patch(':id')
update(...) { ... }
```

`RolesGuard` reads required roles from metadata via `Reflector`. If no roles are required, access is allowed. If roles are required, the authenticated user's role must match at least one.

---

## Session Token Pattern (for MFA/OTP flows)

For multi-step login, a short-lived session token bridges step 1 (password validation) and step 2 (OTP validation):

1. Step 1: validate credentials → issue a random session token stored in memory (60-second TTL).
2. Step 2: receive session token + OTP → validate both → consume the session token → return JWT tokens.

Session tokens are in-memory only (not persisted). They are consumed on use. TTL is enforced on validation.

This pattern does not require Redis for typical low-traffic admin flows. For high-traffic or multi-instance deployments, move session storage to Redis.

---

## `@CurrentUser()` Decorator

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

Use it in controllers to access the authenticated user without touching `@Request()`:

```ts
@Get('me')
@UseGuards(JwtAuthGuard)
me(@CurrentUser() user: { id: string; email: string; role: string }) {
  return this.authService.me(user.id);
}
```

---

## Implementation Checklist

- [ ] `AuthModule` imports `PassportModule` and `JwtModule.registerAsync({ useFactory: ... })` (not `.register(...)`) with the secret read via a throwing helper
- [ ] `AuthModule` exports `AuthService` and `JwtModule` (so domain modules can verify tokens if needed)
- [ ] `LocalStrategy` and `JwtStrategy` registered as providers
- [ ] `HybridAuthGuard` used on routes that must accept both API key and JWT
- [ ] `RolesGuard` applied after auth guard on all RBAC-restricted routes
- [ ] `@CurrentUser()` used instead of `@Request()` in controllers
- [ ] `RefreshToken` entity registered via `TypeOrmModule.forFeature([...])`; refresh issuance, rotation-on-use, logout revocation, and password-reset bulk revocation all implemented (see Refresh Token Design above)
- [ ] JWT secret is env-driven and read through a throwing helper — no hardcoded literal fallback anywhere
- [ ] `JwtStrategy.validate()` rejects soft-deleted users on every request (via the query layer's default `deletedAt IS NULL` exclusion, mapped to `UnauthorizedException`) — no separate `isActive` flag
- [ ] Auth routes documented in Swagger: `@ApiBearerAuth()`, `@ApiSecurity('api-key')`
- [ ] Guards tested: happy path (correct role), denial (wrong role), no-role-required (allow)
- [ ] Refresh flow tested: valid rotation, reuse of an already-rotated/revoked token rejected, expired token rejected
- [ ] Env variables added to `.env.example`

---

## Dependencies Required

This pattern requires adding these packages (not present in the base template):

```bash
npm install @nestjs/passport @nestjs/jwt passport passport-jwt passport-local bcrypt
npm install -D @types/passport-jwt @types/passport-local @types/bcrypt
```

`bcrypt` is the approved password-hashing library for this pattern (chosen over `argon2` — well-established, widely audited, no native-build friction beyond what the base template's Docker image already tolerates). Use it only for password hashing (`bcrypt.hash` / `bcrypt.compare`); refresh, verification, and reset tokens are high-entropy random values hashed with plain SHA-256 for lookup, not with bcrypt (see Refresh Token Design above).

Do not install without explicit confirmation.