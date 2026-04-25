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
| `JwtStrategy` | Validate Bearer tokens via passport-jwt; load user and check `isActive` |
| `HybridAuthGuard` | Try API key header first; fall back to JWT — allows both machine and human callers on the same route |
| `RolesGuard` | Read `@Roles(...)` from route metadata via `Reflector`; verify user role |
| `@CurrentUser()` | Extract `request.user` set by the auth strategy |

---

## JWT Token Design

- Payload: `{ sub: userId, email: string, role: string }`.
- Two tokens: short-lived `accessToken`, long-lived `refreshToken`.
- Separate secrets for access and refresh tokens.
- JWT strategy validates `isActive` on every authenticated request.

Required env variables:
```
JWT_SECRET=...
JWT_EXPIRES_IN=3600s
JWT_REFRESH_SECRET=...
JWT_REFRESH_EXPIRES_IN=7d
```

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

- [ ] `AuthModule` imports `PassportModule` and `JwtModule.register(...)` with env-driven secrets
- [ ] `AuthModule` exports `AuthService` and `JwtModule` (so domain modules can verify tokens if needed)
- [ ] `LocalStrategy` and `JwtStrategy` registered as providers
- [ ] `HybridAuthGuard` used on routes that must accept both API key and JWT
- [ ] `RolesGuard` applied after auth guard on all RBAC-restricted routes
- [ ] `@CurrentUser()` used instead of `@Request()` in controllers
- [ ] JWT secrets and expiry are env-driven — no hardcoded defaults in production
- [ ] `JwtStrategy.validate()` checks `isActive` on every request
- [ ] Auth routes documented in Swagger: `@ApiBearerAuth()`, `@ApiSecurity('api-key')`
- [ ] Guards tested: happy path (correct role), denial (wrong role), no-role-required (allow)
- [ ] Env variables added to `.env.example`

---

## Dependencies Required

This pattern requires adding these packages (not present in the base template):

```bash
npm install @nestjs/passport @nestjs/jwt passport passport-jwt passport-local
npm install -D @types/passport-jwt @types/passport-local
```

Do not install without explicit confirmation.