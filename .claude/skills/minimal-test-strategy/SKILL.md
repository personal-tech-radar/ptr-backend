# Skill: minimal-test-strategy

Use this skill when writing tests for services or guards. It defines the default CRUD test set, test harness structure, mocking conventions, and guidance for non-standard logic.

---

## Philosophy

- Do not aim for 100% coverage.
- Write tests that are minimal, sufficient, readable, and maintainable.
- Test service behavior, not framework behavior. Do not test what `ValidationPipe` or TypeORM already guarantee.
- Mock only what is necessary: the TypeORM repository and `LoggingService`.

---

## Default CRUD Test Set

For every standard CRUD service, create these tests automatically:

| Method | Scenario | Assert |
|---|---|---|
| `findOne` | Happy path | Returns correct entity |
| `findOne` | Invalid UUID format | Throws `BadRequestException`, repo not called |
| `findOne` | Not found | Throws `NotFoundException` |
| `findAll` | Default params | Correct `skip`/`take`, correct `meta` shape |
| `findAll` | With search query | Filter applied, results returned |
| `create` | Happy path | Entity saved, correct fields set |
| `create` | Conflict (if applicable) | Throws `ConflictException` |
| `update` | Happy path | Fields updated and saved |
| `update` | Invalid UUID format | Throws `BadRequestException` |
| `remove` | Happy path | `deletedAt` set, entity returned |
| `remove` | Invalid UUID format | Throws `BadRequestException` |

Omit scenarios that genuinely do not apply to the domain. Add domain-specific cases only when there is real logic to test.

---

## Test Harness Template

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ItemsService } from './items.service';
import { Item } from '../entities/item.entity';
import { LoggingService } from '../../common/logging/logging.service';

describe('ItemsService', () => {
  let service: ItemsService;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockLoggingService = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const validId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: getRepositoryToken(Item), useValue: mockRepository },
        { provide: LoggingService, useValue: mockLoggingService },
      ],
    }).compile();

    service = module.get<ItemsService>(ItemsService);
    jest.clearAllMocks();
  });

  describe('findOne', () => {
    it('should return an item by valid ID', async () => {
      const mockItem = { id: validId, name: 'Widget' };
      mockRepository.findOne.mockResolvedValue(mockItem);

      const result = await service.findOne(validId);
      expect(result).toEqual(mockItem);
    });

    it('should throw BadRequestException for invalid ID format', async () => {
      await expect(service.findOne('not-a-uuid')).rejects.toThrow(BadRequestException);
      expect(mockRepository.findOne).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when item does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne(validId)).rejects.toThrow(NotFoundException);
    });
  });
  // ... remaining test groups
});
```

---

## QueryBuilder Mock Pattern

For paginated queries using `createQueryBuilder`:

```ts
const mockQueryBuilder = {
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([mockItems, 25]),
};

mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
```

Verify `skip`, `take`, and `where` calls. Verify the returned `meta` shape contains `total`, `page`, `limit`, `totalPages`.

---

## Non-Standard Business Logic

When implementing a service with non-standard business logic:

1. **Propose the test cases first** — list each scenario and one sentence on what it covers.
2. **Wait for implicit or explicit approval** before writing the tests.
3. Write the minimal set that covers the distinct outcomes of each branch or rule.

Example proposal format:
```
Proposed tests for PublicationsService.create:
- Active publication requires non-empty title and text → BadRequestException when empty
- Slug must be unique for the day → ConflictException on duplicate
- Authors and tags resolved from provided IDs → correct relations saved
- Cache invalidation triggered in background → does not block the response
```

---

## Guard Test Pattern

Guards are tested with a minimal `mockContext`:

```ts
const mockContext = {
  switchToHttp: () => ({ getRequest: () => mockRequest }),
  getHandler: jest.fn(),
  getClass: jest.fn(),
} as any;
```

For role-based guards using `Reflector`, mock `reflector.getAllAndOverride` to return required roles. Test: user has required role (allow), user lacks role (deny), no roles required (allow).

---

## What Not to Test

- `ValidationPipe` rejecting malformed request bodies — that is framework behavior.
- TypeORM connection or query behavior — that is infrastructure.
- Private methods directly — test them through public method behavior.
- Console/log output unless the logging behavior itself is the feature under test.