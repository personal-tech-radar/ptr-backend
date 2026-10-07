import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { ADMIN_ACTIVITY_SQL, adminPeriod, AdminPeriod } from '../../common/util/admin-period.util';
import { PopularityItemDto, UserAnalyticsResponseDto } from '../dto/user-analytics-response.dto';

@Injectable()
export class UserAnalyticsService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async get(value: AdminPeriod, now = new Date()): Promise<UserAnalyticsResponseDto> {
    const period = adminPeriod(value, now);
    const [counts] = await this.users.query<UserAnalyticsResponseDto[]>(
      `
      WITH events AS (${ADMIN_ACTIVITY_SQL}), activity AS (
        SELECT e.* FROM events e JOIN users u ON u.id=e."userId" AND u."deletedAt" IS NULL
        JOIN articles a ON a.id=e."articleId" AND a."deletedAt" IS NULL WHERE e.at < $2
      ) SELECT
      (SELECT count(*)::int FROM users WHERE "deletedAt" IS NULL) AS registered,
      (SELECT count(*)::int FROM users WHERE "deletedAt" IS NULL AND "emailVerifiedAt" IS NOT NULL) AS verified,
      (SELECT count(*)::int FROM users WHERE "deletedAt" IS NULL AND "onboardingCompletedAt" IS NOT NULL) AS "onboardingCompleted",
      (SELECT count(*)::int FROM users WHERE "deletedAt" IS NULL AND "createdAt">=$1 AND "createdAt"<$2) AS registrations,
      (SELECT count(*)::int FROM users WHERE "deletedAt" IS NULL AND "emailVerifiedAt">=$1 AND "emailVerifiedAt"<$2) AS verifications,
      (SELECT count(*)::int FROM users WHERE "deletedAt" IS NULL AND "onboardingCompletedAt">=$1 AND "onboardingCompletedAt"<$2) AS "onboardingCompletions",
      count(DISTINCT "userId") FILTER (WHERE at >= $3)::int AS dau,
      count(DISTINCT "userId") FILTER (WHERE at >= $4)::int AS wau,
      count(DISTINCT "userId") FILTER (WHERE at >= $5)::int AS mau,
      count(DISTINCT "userId") FILTER (WHERE at >= $1)::int AS "activeUsers",
      count(*) FILTER (WHERE at >= $1 AND type='open')::int AS opens,
      count(*) FILTER (WHERE at >= $1 AND type='save')::int AS saves,
      count(*) FILTER (WHERE at >= $1 AND type='useful')::int AS "usefulFeedback",
      count(*) FILTER (WHERE at >= $1 AND type='not_useful')::int AS "notUsefulFeedback"
      FROM activity`,
      [period.from, period.to, period.dauFrom, period.wauFrom, period.mauFrom],
    );
    const [technologies, interests, streams, sources] = await Promise.all([
      this.popularity('technology', period.from, period.to),
      this.popularity('interest', period.from, period.to),
      this.popularity('stream', period.from, period.to),
      this.popularity('source', period.from, period.to),
    ]);
    return {
      ...counts,
      period,
      popularity: {
        semantics:
          'Top 20 per dimension by period active users, then current selections, then name/ID. Selections are current; engagement uses retained events in the selected period.',
        technologies,
        interests,
        streams,
        sources,
      },
    };
  }

  private async popularity(
    kind: 'technology' | 'interest' | 'stream' | 'source',
    from: Date,
    to: Date,
  ): Promise<PopularityItemDto[]> {
    const taxonomy = kind === 'technology' || kind === 'interest';
    const dimension = taxonomy
      ? 'technology_interests'
      : kind === 'stream'
        ? 'content_streams'
        : 'sources';
    const selection = taxonomy
      ? 'user_technology_interests'
      : kind === 'stream'
        ? 'user_content_streams'
        : 'user_source_preferences';
    const key = taxonomy
      ? 'technologyInterestId'
      : kind === 'stream'
        ? 'contentStreamId'
        : 'sourceId';
    const mapping = taxonomy
      ? 'JOIN article_technology_interests m ON m."articleId"=a.id'
      : kind === 'stream'
        ? 'JOIN article_streams m ON m."articleId"=a.id'
        : '';
    const eventKey = taxonomy
      ? 'm."technologyInterestId"'
      : kind === 'stream'
        ? 'm."streamId"'
        : 'a."sourceId"';
    const condition = taxonomy
      ? `d."deletedAt" IS NULL AND d.kind='${kind}'`
      : kind === 'source'
        ? 'd."deletedAt" IS NULL'
        : 'true';
    const nonzero =
      kind === 'source'
        ? 'AND (s."openedCount"+s."savedCount"+s."usefulCount"+s."notUsefulCount")>0'
        : '';
    return this.users.query<PopularityItemDto[]>(
      `WITH events AS (${ADMIN_ACTIVITY_SQL}), engagement AS (
      SELECT ${eventKey} AS id, count(DISTINCT e."userId")::int AS "activeUsers",
      count(*) FILTER (WHERE e.type='open')::int AS opens, count(*) FILTER (WHERE e.type='save')::int AS saves,
      count(*) FILTER (WHERE e.type='useful')::int AS "usefulFeedback", count(*) FILTER (WHERE e.type='not_useful')::int AS "notUsefulFeedback"
      FROM events e JOIN users u ON u.id=e."userId" AND u."deletedAt" IS NULL
      JOIN articles a ON a.id=e."articleId" AND a."deletedAt" IS NULL ${mapping}
      WHERE e.at >= $1 AND e.at < $2 GROUP BY ${eventKey}
    ), selections AS (
      SELECT s."${key}" AS id, count(DISTINCT s."userId")::int AS total FROM ${selection} s
      JOIN users u ON u.id=s."userId" AND u."deletedAt" IS NULL WHERE true ${nonzero} GROUP BY s."${key}"
    ) SELECT d.id,d.name,coalesce(s.total,0) AS "selectedUsers",coalesce(e."activeUsers",0) AS "activeUsers",coalesce(e.opens,0) AS opens,coalesce(e.saves,0) AS saves,coalesce(e."usefulFeedback",0) AS "usefulFeedback",coalesce(e."notUsefulFeedback",0) AS "notUsefulFeedback"
      FROM ${dimension} d LEFT JOIN selections s ON s.id=d.id LEFT JOIN engagement e ON e.id=d.id
      WHERE ${condition} ORDER BY "activeUsers" DESC,"selectedUsers" DESC,d.name,d.id LIMIT 20`,
      [from, to],
    );
  }
}
