---
name: test-backend-service
description: Add or review focused Jest tests for NestJS services, guards, query builders, CRUD behavior, and non-standard business rules in this repository. Use when implementation changes service or guard behavior. Do not use to test framework guarantees or real infrastructure.
---

# Test a Backend Service

Write the smallest readable set of tests that covers distinct project behavior.

## Test boundaries

- Test public service or guard behavior, not private methods.
- Do not test `ValidationPipe`, TypeORM, or NestJS framework guarantees.
- Mock only required collaborators, commonly repositories and `LoggingService`.
- Keep specs co-located with the implementation.
- Do not mock the service under test.

## Standard CRUD coverage

Cover applicable cases:

- `findOne`: success, malformed UUID, not found.
- `findAll`: default pagination, filters, and exact metadata.
- `create`: success and uniqueness conflict.
- `update`: success and malformed UUID.
- `remove`: success through repository `softDelete` and malformed UUID.

For query builders, provide chainable mocks for the methods actually used and verify `skip`, `take`, filters, and `getManyAndCount`.

## Non-standard logic

Identify distinct outcomes before writing tests. Cover meaningful branches, state transitions, error paths, and idempotency without multiplying equivalent examples.

For guards, test allowed access, denied access, and routes with no role requirement.
