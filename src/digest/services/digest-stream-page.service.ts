import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ArticleAnalysis } from '../../ai-analysis/entities/article-analysis.entity';
import { PersonalArticleLinkContext } from '../../user-actions/entities/personal-article-link.entity';
import { PermanentArticleActionType } from '../../user-actions/entities/permanent-article-action.entity';
import { PermanentArticleActionService } from '../../user-actions/services/permanent-article-action.service';
import { PersonalArticleLinkService } from '../../user-actions/services/personal-article-link.service';
import { DigestItem } from '../entities/digest-item.entity';
import { DigestStreamPage } from '../entities/digest-stream-page.entity';

@Injectable()
export class DigestStreamPageService {
  constructor(
    @InjectRepository(DigestStreamPage) private readonly pageRepo: Repository<DigestStreamPage>,
    @InjectRepository(DigestItem) private readonly itemRepo: Repository<DigestItem>,
    @InjectRepository(ArticleAnalysis) private readonly analysisRepo: Repository<ArticleAnalysis>,
    private readonly linkService: PersonalArticleLinkService,
    private readonly actionService: PermanentArticleActionService,
  ) {}

  async render(pageId: string): Promise<string> {
    const page = await this.pageRepo.findOne({
      where: { id: pageId },
      relations: { digest: true, stream: true },
    });
    if (!page || !page.digest.userId) throw new NotFoundException('Digest stream page not found');
    const items = await this.itemRepo.find({
      where: { digestId: page.digestId },
      relations: { article: true },
      order: { position: 'ASC' },
    });
    const analyses = await this.analysisRepo.find({
      where: { articleId: In(items.map((item) => item.articleId)), mainStreamId: page.streamId },
    });
    const analysisByArticle = new Map(analyses.map((analysis) => [analysis.articleId, analysis]));
    const filtered = items.filter((item) => analysisByArticle.has(item.articleId));
    const [links, actions] = await Promise.all([
      this.linkService.findOrCreateLinksBatch(
        page.digest.userId,
        filtered.map((item) => item.articleId),
        PersonalArticleLinkContext.DIGEST_STREAM_PAGE,
      ),
      this.actionService.findOrCreateBatch(
        page.digest.userId,
        filtered.map((item) => item.articleId),
      ),
    ]);
    const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
    const cards = filtered
      .map((item) => {
        const analysis = analysisByArticle.get(item.articleId)!;
        const tracking = `${appUrl}/r/${links.get(item.articleId)}`;
        const action = actions.get(item.articleId)!;
        return `<article><h2><a href="${tracking}">${escapeHtml(item.article.title)}</a></h2><p>${escapeHtml(analysis.shortSummary ?? '')}</p><p><a href="${tracking}">Open article</a> · <a href="${this.actionService.buildUrl(action[PermanentArticleActionType.SAVE])}">Save</a> · <a href="${this.actionService.buildUrl(action[PermanentArticleActionType.USEFUL])}">Useful</a> · <a href="${this.actionService.buildUrl(action[PermanentArticleActionType.NOT_USEFUL])}">Not useful</a></p></article>`;
      })
      .join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(page.stream.name)}</title><style>body{font-family:system-ui;max-width:760px;margin:40px auto;padding:0 20px;color:#111827}article{padding:20px 0;border-bottom:1px solid #e5e7eb}h2{font-size:18px}a{color:#2563eb}</style></head><body><h1>${escapeHtml(page.stream.name)}</h1>${cards}</body></html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
