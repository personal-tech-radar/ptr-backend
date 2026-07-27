import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SaveFromEmailController } from './save-from-email.controller';
import { SaveLinkSignatureService } from '../services/save-link-signature.service';
import { UserQueryService } from '../../users/services/user-query.service';
import { ArticlesService } from '../../articles/services/articles.service';
import { SavedArticleService } from '../services/saved-article.service';

const userId = '123e4567-e89b-12d3-a456-426614174000';
const articleId = '223e4567-e89b-12d3-a456-426614174000';

const mockSaveLinkSignatureService = {
  verify: jest.fn(),
};
const mockUserQueryService = {
  findById: jest.fn(),
};
const mockArticlesService = {
  findOne: jest.fn(),
};
const mockSavedArticleService = {
  create: jest.fn(),
};

describe('SaveFromEmailController', () => {
  let controller: SaveFromEmailController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SaveFromEmailController],
      providers: [
        { provide: SaveLinkSignatureService, useValue: mockSaveLinkSignatureService },
        { provide: UserQueryService, useValue: mockUserQueryService },
        { provide: ArticlesService, useValue: mockArticlesService },
        { provide: SavedArticleService, useValue: mockSavedArticleService },
      ],
    }).compile();

    controller = module.get(SaveFromEmailController);
  });

  it('renders success HTML and saves the article on a valid signature', async () => {
    mockSaveLinkSignatureService.verify.mockReturnValue(true);
    mockUserQueryService.findById.mockResolvedValue({ id: userId });
    mockArticlesService.findOne.mockResolvedValue({ id: articleId });
    mockSavedArticleService.create.mockResolvedValue({ id: 'sa-1' });

    const html = await controller.saveFromEmail(articleId, { userId, signature: 'sig' });

    expect(mockSavedArticleService.create).toHaveBeenCalledWith(userId, articleId);
    expect(html).toContain('<html');
    expect(html).toContain('Article saved');
  });

  it('renders an HTML error page (not a raw exception) on an invalid signature', async () => {
    mockSaveLinkSignatureService.verify.mockReturnValue(false);

    const html = await controller.saveFromEmail(articleId, { userId, signature: 'bad-sig' });

    expect(html).toContain('<html');
    expect(html).toContain('Link expired or invalid');
    expect(mockUserQueryService.findById).not.toHaveBeenCalled();
    expect(mockSavedArticleService.create).not.toHaveBeenCalled();
  });

  it('renders the same HTML error page (not a raw JSON 400) on a malformed, non-UUID userId', async () => {
    const html = await controller.saveFromEmail(articleId, {
      userId: 'not-a-uuid',
      signature: 'sig',
    });

    expect(html).toContain('<html');
    expect(html).toContain('Link expired or invalid');
    expect(mockSaveLinkSignatureService.verify).not.toHaveBeenCalled();
    expect(mockUserQueryService.findById).not.toHaveBeenCalled();
    expect(mockSavedArticleService.create).not.toHaveBeenCalled();
  });

  it('renders an HTML error page when the user no longer exists', async () => {
    mockSaveLinkSignatureService.verify.mockReturnValue(true);
    mockUserQueryService.findById.mockRejectedValue(new NotFoundException('User not found'));

    const html = await controller.saveFromEmail(articleId, { userId, signature: 'sig' });

    expect(html).toContain('Link no longer available');
    expect(mockSavedArticleService.create).not.toHaveBeenCalled();
  });

  it('renders an HTML error page when the article no longer exists', async () => {
    mockSaveLinkSignatureService.verify.mockReturnValue(true);
    mockUserQueryService.findById.mockResolvedValue({ id: userId });
    mockArticlesService.findOne.mockRejectedValue(new NotFoundException('Article not found'));

    const html = await controller.saveFromEmail(articleId, { userId, signature: 'sig' });

    expect(html).toContain('Article no longer available');
    expect(mockSavedArticleService.create).not.toHaveBeenCalled();
  });
});
