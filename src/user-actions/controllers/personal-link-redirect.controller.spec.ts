import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, NotFoundException } from '@nestjs/common';
import { PersonalLinkRedirectController } from './personal-link-redirect.controller';
import { PersonalArticleLinkService } from '../services/personal-article-link.service';

const linkId = '123e4567-e89b-12d3-a456-426614174000';
const article = { id: 'a-1', url: 'https://example.com/article' };

const mockPersonalArticleLinkService = {
  resolveAndRecordOpen: jest.fn(),
};

describe('PersonalLinkRedirectController', () => {
  let controller: PersonalLinkRedirectController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PersonalLinkRedirectController],
      providers: [
        { provide: PersonalArticleLinkService, useValue: mockPersonalArticleLinkService },
      ],
    }).compile();

    controller = module.get(PersonalLinkRedirectController);
  });

  it('returns the @Redirect() shape pointing at the article URL', async () => {
    mockPersonalArticleLinkService.resolveAndRecordOpen.mockResolvedValue({ article });

    const result = await controller.goToArticle(linkId);

    expect(result).toEqual({ url: article.url, statusCode: HttpStatus.FOUND });
  });

  it('lets NotFoundException propagate for an unresolved linkId', async () => {
    mockPersonalArticleLinkService.resolveAndRecordOpen.mockRejectedValue(
      new NotFoundException('Personal article link not found'),
    );

    await expect(controller.goToArticle(linkId)).rejects.toThrow(NotFoundException);
  });
});
