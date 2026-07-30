---
name: scaffold-nestjs-domain
description: Create or extend a standard NestJS domain module with entities, controllers, services, DTOs, validation, Swagger contracts, pagination, soft deletion, and module registration. Use for new CRUD domains or substantial domain scaffolding in src. Do not use for a small edit inside an existing module.
---

# Scaffold a NestJS Domain

Inspect neighboring domains and follow the closest current pattern.

## Structure

Use:

```text
src/<domain>/
├── <domain>.module.ts
├── controllers/<domain>.controller.ts
├── services/<domain>.service.ts
├── dto/
└── entities/<domain>.entity.ts
```

Split command, query, and pure domain services only when responsibilities or dependencies justify it. Register the module in `AppModule`.

## Entity

- Use `@PrimaryGeneratedColumn('uuid')`.
- Use explicit TypeORM column types.
- Use `@CreateDateColumn()` and `@UpdateDateColumn()` with `Date`.
- Use nullable `@DeleteDateColumn()` for soft deletion.
- Register repositories with `TypeOrmModule.forFeature`.
- Generate a migration after entity changes.

## Controller and DTOs

- Keep controllers as routing adapters.
- Use input DTO validation and trim user-facing strings.
- Transform numeric query parameters with `@Type(() => Number)`.
- Use `PartialType` for standard update DTOs.
- Return response DTO contracts rather than relying on raw entity serialization.
- Document routes, success responses, errors, and authentication in Swagger.

## Service

- Inject the TypeORM repository directly.
- Use `create`, `findAll`, `findOne`, `update`, and `remove`.
- Validate UUIDs before queries.
- Throw `NotFoundException` and `ConflictException` where applicable.
- Return paginated results as `{ data, meta: { total, page, limit, totalPages } }`.
- Use repository `softDelete`; do not assign deletion timestamps manually.
- Log successful writes through `LoggingService`.

## Completion

- Generate and review the migration.
- Add focused service tests.
- Update `README.md` and `.env.example` when affected.
