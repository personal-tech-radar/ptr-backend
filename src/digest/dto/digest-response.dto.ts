import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { ArticleResponseDto } from '../../articles/dto/article-response.dto';
import { ScoringResultBreakdown } from '../../scoring/scoring.types';
import { Digest, DigestStatus, DigestType } from '../entities/digest.entity';
import { DigestItem } from '../entities/digest-item.entity';

export class DigestResponseDto {
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

  @ApiPropertyOptional()
  sentAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class DigestItemResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  articleId: string;

  @ApiProperty({ type: ArticleResponseDto })
  article: ArticleResponseDto;

  @ApiProperty()
  position: number;

  @ApiPropertyOptional({ description: 'Ranking score breakdown for this item, if recorded' })
  scoreBreakdown: ScoringResultBreakdown | null;
}

export class DigestDetailResponseDto extends DigestResponseDto {
  @ApiProperty({ type: [DigestItemResponseDto] })
  items: DigestItemResponseDto[];
}

// digest.user must be loaded (joined) for userEmail to resolve — see
// DigestQueryService.findAll/findByIdWithItems.
export function toDigestResponseDto(digest: Digest): DigestResponseDto {
  return {
    id: digest.id,
    userId: digest.userId,
    userEmail: digest.user?.email ?? null,
    type: digest.type,
    periodStart: digest.periodStart,
    periodEnd: digest.periodEnd,
    subject: digest.subject,
    status: digest.status,
    sentAt: digest.sentAt,
    createdAt: digest.createdAt,
  };
}

function toDigestItemResponseDto(item: DigestItem): DigestItemResponseDto {
  return {
    id: item.id,
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
export function toDigestDetailResponseDto(digest: Digest): DigestDetailResponseDto {
  return {
    ...toDigestResponseDto(digest),
    items: digest.items.map(toDigestItemResponseDto),
  };
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
