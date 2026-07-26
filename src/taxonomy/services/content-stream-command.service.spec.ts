import { ContentStreamCommandService } from './content-stream-command.service';

describe('ContentStreamCommandService', () => {
  let service: ContentStreamCommandService;

  const mockUserContentStreamRepo = {
    findOne: jest.fn(),
    create: jest.fn((data: unknown) => data),
    save: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ContentStreamCommandService(mockUserContentStreamRepo as any);
  });

  it('links every selection not already linked', async () => {
    mockUserContentStreamRepo.findOne.mockResolvedValue(null);

    await service.linkUserSelections('user-1', ['cs-1', 'cs-2']);

    expect(mockUserContentStreamRepo.save).toHaveBeenCalledTimes(2);
    expect(mockUserContentStreamRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', contentStreamId: 'cs-1' }),
    );
  });

  it('skips a selection the user is already linked to (idempotent upsert-ignore)', async () => {
    mockUserContentStreamRepo.findOne.mockResolvedValue({ id: 'link-1' });

    await service.linkUserSelections('user-1', ['cs-1']);

    expect(mockUserContentStreamRepo.save).not.toHaveBeenCalled();
  });
});
