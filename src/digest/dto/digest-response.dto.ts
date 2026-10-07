import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { ArticleResponseDto } from '../../articles/dto/article-response.dto';
import { ScoringResultBreakdown } from '../../scoring/scoring.types';
import { Digest, DigestDeliveryMode, DigestStatus, DigestType } from '../entities/digest.entity';
import { DigestItem } from '../entities/digest-item.entity';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import {
  DigestStatisticsResponseDto,
  DigestBuildDebugResponseDto,
} from './digest-statistics-response.dto';

export class DigestResponseDto {
  @ApiProperty({ description: 'Number of retained digest items.' }) articleCount: number;
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({
    description: 'Recipient user id — real FK to users.id (nullable only for pre-Phase-10 rows)',
  })
  userId: string | null;

  @ApiPropertyOptional({ description: 'Recipient user email, joined from users.email' })
  userEmail: string | null;

  @ApiProperty({ enum: DigestType })
  type: DigestType;

  @ApiProperty()
  periodStart: Date;

  @ApiProperty()
  periodEnd: Date;

  @ApiProperty()
  subject: string;

  @ApiProperty({ enum: DigestStatus })
  status: DigestStatus;

  @ApiProperty({ enum: DigestDeliveryMode })
  deliveryMode: DigestDeliveryMode;

  @ApiPropertyOptional({ type: String, nullable: true })
  triggeringAdministratorId: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  actualRecipientEmail: string | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  sentAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({
    type: () => [DigestStreamPageLinkResponseDto],
    description: 'Temporary backend-rendered pages for the streams included in this digest',
  })
  streamPages: DigestStreamPageLinkResponseDto[];
}

export class DigestStreamPageLinkResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  streamId: string;

  @ApiProperty()
  streamKey: string;

  @ApiProperty()
  streamName: string;

  @ApiProperty({ description: 'Permanent opaque URL for the temporary rendered stream page' })
  url: string;
}

export class DigestItemResponseDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'LLM-written description extracted from the stored email body; null for unrecognized legacy layouts.',
  })
  shortDescription: string | null;
  @ApiProperty({ enum: ['stored_body', 'unavailable'] }) descriptionSource:
    | 'stored_body'
    | 'unavailable';
  @ApiProperty()
  id: string;

  @ApiProperty()
  articleId: string;

  @ApiProperty({ type: ArticleResponseDto })
  article: ArticleResponseDto;

  @ApiProperty()
  position: number;

  @ApiPropertyOptional({
    type: () => DigestScoreBreakdownDto,
    nullable: true,
    description: 'Ranking score breakdown for this item, if recorded',
  })
  scoreBreakdown: ScoringResultBreakdown | null;
}

export class DigestDetailResponseDto extends DigestResponseDto {
  @ApiProperty() periodKey: string;
  @ApiProperty({ type: DigestStatisticsResponseDto, nullable: true })
  statisticsSnapshot: DigestStatisticsResponseDto | null;
  @ApiProperty({ type: DigestBuildDebugResponseDto, nullable: true })
  buildDebug: DigestBuildDebugResponseDto | null;
  @ApiProperty() intro: string;
  @ApiProperty({ description: 'Original stored HTML; treat as untrusted content when displaying.' })
  htmlBody: string;
  @ApiProperty() textBody: string;
  @ApiProperty({ type: [DigestItemResponseDto] })
  items: DigestItemResponseDto[];
}

// digest.user must be loaded (joined) for userEmail to resolve — see
// DigestQueryService.findAll/findByIdWithItems.
export function toDigestResponseDto(digest: Digest & { articleCount?: number }): DigestResponseDto {
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return {
    id: digest.id,
    articleCount: digest.articleCount ?? digest.items?.length ?? 0,
    userId: digest.userId,
    userEmail: digest.user?.email ?? null,
    type: digest.type,
    periodStart: digest.periodStart,
    periodEnd: digest.periodEnd,
    subject: digest.subject,
    status: digest.status,
    deliveryMode: digest.deliveryMode,
    triggeringAdministratorId: digest.triggeringAdministratorId,
    actualRecipientEmail: digest.actualRecipientEmail,
    sentAt: digest.sentAt,
    createdAt: digest.createdAt,
    streamPages: (digest.streamPages ?? []).map((page) => ({
      id: page.id,
      streamId: page.streamId,
      streamKey: page.stream.key,
      streamName: page.stream.name,
      url: `${appUrl}/digest-stream/${page.id}`,
    })),
  };
}

function toDigestItemResponseDto(
  item: DigestItem,
  description: string | null,
): DigestItemResponseDto {
  return {
    id: item.id,
    shortDescription: description,
    descriptionSource: description === null ? 'unavailable' : 'stored_body',
    articleId: item.articleId,
    article: {
      id: item.article.id,
      sourceId: item.article.sourceId,
      title: item.article.title,
      url: item.article.url,
      urlHash: item.article.urlHash,
      author: item.article.author,
      publishedAt: item.article.publishedAt,
      summaryFromFeed: item.article.summaryFromFeed,
      status: item.article.status,
      createdAt: item.article.createdAt,
      updatedAt: item.article.updatedAt,
    },
    position: item.position,
    scoreBreakdown: item.scoreBreakdown,
  };
}

// entity.items and each item.article must be loaded (relations: ['items', 'items.article'])
// before calling this — see DigestQueryService.findByIdWithItems.
export function toDigestDetailResponseDto(
  digest: Digest,
  descriptions = new Map<number, string>(),
): DigestDetailResponseDto {
  return {
    ...toDigestResponseDto(digest),
    intro: digest.intro,
    periodKey: digest.periodKey,
    statisticsSnapshot: digest.statisticsSnapshot,
    buildDebug: digest.buildDebug,
    htmlBody: digest.htmlBody,
    textBody: digest.textBody,
    items: digest.items.map((item) =>
      toDigestItemResponseDto(item, descriptions.get(item.position) ?? null),
    ),
  };
}

export class DigestScoreBreakdownDto implements ScoringResultBreakdown {
  @ApiProperty() technologyMatch: number;
  @ApiProperty() interestMatch: number;
  @ApiProperty() complexityMatch: number;
  @ApiProperty() qualityScore: number;
  @ApiProperty() recencyScore: number;
  @ApiProperty() sourcePreferenceAdjustment: number;
}
export class PaginatedDigestResponseDto extends PaginatedResponseDto<DigestResponseDto> {
  @ApiProperty({ type: [DigestResponseDto] }) declare data: DigestResponseDto[];
}

export class TriggerDigestDto {
  @ApiProperty({ description: 'Recipient user id — a single-recipient personal digest trigger' })
  @IsUUID()
  userId: string;

  @ApiProperty({
    enum: DigestType,
    enumName: 'DigestType',
    description: 'Digest type to build and send. Options: daily, weekly',
  })
  @IsEnum(DigestType)
  type: DigestType;
}

export class ResendDigestResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  digestId: string;

  @ApiProperty()
  subject: string;

  @ApiPropertyOptional()
  message?: string;
}
