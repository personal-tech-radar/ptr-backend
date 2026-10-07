import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { AdminEventFilterDto } from '../dto/admin-event-filter.dto';

export function applyAdminEventFilters<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  query: AdminEventFilterDto,
  alias: string,
  timestamp: string,
): void {
  if (query.userId) qb.andWhere(`${alias}.userId = :eventUserId`, { eventUserId: query.userId });
  if (query.sourceId)
    qb.andWhere('article.sourceId = :eventSourceId', { eventSourceId: query.sourceId });
  if (query.technologyInterestId)
    qb.andWhere(
      'EXISTS (SELECT 1 FROM article_technology_interests ati WHERE ati."articleId"=article.id AND ati."technologyInterestId"=:eventTaxonomyId)',
      { eventTaxonomyId: query.technologyInterestId },
    );
  if (query.streamId)
    qb.andWhere(
      'EXISTS (SELECT 1 FROM article_streams ast WHERE ast."articleId"=article.id AND ast."streamId"=:eventStreamId)',
      { eventStreamId: query.streamId },
    );
  if (query.occurredFrom)
    qb.andWhere(`${timestamp} >= :eventFrom`, { eventFrom: query.occurredFrom });
  if (query.occurredTo) qb.andWhere(`${timestamp} < :eventTo`, { eventTo: query.occurredTo });
}
