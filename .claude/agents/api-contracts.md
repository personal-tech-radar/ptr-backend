---
name: api-contracts
description: Use when designing or reviewing DTOs, query parameters, response shapes, validation rules, Swagger annotations, or pagination contracts.
---

# API Contracts Agent

Use this agent when adding or reviewing DTOs, validation, Swagger annotations, pagination, or response shapes. For DTO code templates, see the `nestjs-domain-scaffold` skill.

---

## DTO File Set

Every CRUD domain exposes exactly these DTO files:

| File | Purpose |
|---|---|
| `create-<domain>.dto.ts` | POST input — required and optional fields |
| `update-<domain>.dto.ts` | PATCH input — all fields optional (`PartialType` of Create) |
| `query-<domain>.dto.ts` | Query string params — pagination + domain filters |
| `<domain>-response.dto.ts` | Single entity response shape |
| `<domain>-paginated-response.dto.ts` | List response extending `PaginatedResponseDto<T>` |

Never return raw TypeORM entities from controllers.

---

## Validation Rules

- Use `class-validator` decorators on all input DTOs.
- Use `@Transform(({ value }) => value?.trim())` on all user-facing string fields.
- Numeric query params must use `@Type(() => Number)` + `@IsInt()` — query strings are strings by default.
- `ValidationPipe` is global (`whitelist`, `forbidNonWhitelisted`, `transform`, `enableImplicitConversion`). Do not reconfigure it per-controller or per-route.
- Every DTO field must have `@ApiProperty` with `description` and `example`.

---

## Pagination Contract

Query DTOs must include `page` (default `1`, min `1`) and `limit` (default `20`, min `1`), both decorated with `@IsOptional`, `@Type(() => Number)`, `@IsInt`, `@Min(1)`. Add domain-specific filters below these standard fields.

The paginated response shape is fixed and must not be altered:

```json
{
  "data": [...],
  "meta": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 }
}
```

Extend `PaginatedResponseDto<T>` from `src/common/dto/paginated-response.dto.ts` for all list responses.

---

## Error Response Shape

`AppExceptionFilter` always returns:

```json
{ "statusCode": 404, "path": "/items/abc", "message": "...", "errorCode": "NOT_FOUND" }
```

`errorCode` is optional. Pass it via the exception response object when a machine-readable code is useful. Use `ErrorResponseDto` as the Swagger type on all error responses.

---

## Swagger Requirements

- Controller: `@ApiTags`, `@ApiBadRequestResponse({ type: ErrorResponseDto })`.
- Every route: `@ApiOperation({ summary: '...' })`, `@ApiResponse` for every success status, `@ApiResponse` for every error status (400, 401, 403, 404, 409).
- Auth-protected routes: `@ApiSecurity('api-key')` or `@ApiBearerAuth()` as appropriate.

---

## Backward Compatibility

- Do not remove or rename DTO fields.
- Do not change the type of a field in a breaking way.
- Do not change route paths or HTTP methods without explicit instruction.
- Adding new optional fields to requests or new fields to responses is safe.
- Flag any breaking change explicitly before proceeding.