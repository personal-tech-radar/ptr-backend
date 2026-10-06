import { AdminTechnologyInterestsController } from './admin-technology-interests.controller';
import { TechnologyInterestKind } from '../entities/technology-interest.entity';

describe('AdminTechnologyInterestsController', () => {
  const commandService = { createForAdmin: jest.fn() };
  const controller = new AdminTechnologyInterestsController(
    {} as never,
    commandService as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns an explicit existing outcome without implying discovery was queued', async () => {
    commandService.createForAdmin.mockResolvedValue({
      entity: {
        id: 'taxonomy-1',
        kind: TechnologyInterestKind.TECHNOLOGY,
        name: 'OpenTelemetry',
        aliases: [],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      created: false,
    });

    await expect(
      controller.create({ kind: TechnologyInterestKind.TECHNOLOGY, name: 'OpenTelemetry' }),
    ).resolves.toMatchObject({
      created: false,
      message: 'Technology/interest already exists; source discovery was not queued',
      taxonomy: { id: 'taxonomy-1', name: 'OpenTelemetry' },
    });
  });
});
