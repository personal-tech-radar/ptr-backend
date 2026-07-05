import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { WebDiscoveryMethod, WebExtractionMethod } from '../entities/web-source-config.entity';

const MAX_SELECTOR_LENGTH = 300;
const MAX_URL_ARRAY_SIZE = 50;

export class WebConfigDto {
  @ApiPropertyOptional({
    description: 'Entry/listing page URLs to start discovery and Cheerio link crawling from',
    example: ['https://example.com/blog'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_URL_ARRAY_SIZE)
  @IsUrl({}, { each: true })
  entryUrls?: string[];

  @ApiPropertyOptional({
    description: 'Known sitemap URL, if any',
    example: 'https://example.com/sitemap.xml',
  })
  @IsOptional()
  @IsUrl()
  sitemapUrl?: string;

  @ApiPropertyOptional({
    description: 'Preferred discovery method to try first when (re)validating this source',
    enum: WebDiscoveryMethod,
    example: WebDiscoveryMethod.SITEMAP,
  })
  @IsOptional()
  @IsEnum(WebDiscoveryMethod)
  preferredDiscoveryMethod?: WebDiscoveryMethod;

  @ApiPropertyOptional({
    description: 'Preferred content extraction method for articles from this source',
    enum: WebExtractionMethod,
    example: WebExtractionMethod.READABILITY,
  })
  @IsOptional()
  @IsEnum(WebExtractionMethod)
  preferredExtractionMethod?: WebExtractionMethod;

  @ApiPropertyOptional({
    description: 'CSS selector for article links on a listing page',
    example: 'article.post h2 a',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SELECTOR_LENGTH)
  articleLinkSelector?: string;

  @ApiPropertyOptional({
    description: 'CSS selector for the article body, used as a Readability fallback',
    example: 'article.post-content',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SELECTOR_LENGTH)
  articleContentSelector?: string;

  @ApiPropertyOptional({
    description: 'CSS selector for a "next page" link on paginated listings',
    example: 'a.next-page',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SELECTOR_LENGTH)
  nextPageSelector?: string;

  @ApiPropertyOptional({
    description: 'Path patterns explicitly allowed as articles',
    example: ['/blog/*'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_URL_ARRAY_SIZE)
  @IsString({ each: true })
  allowedPathPatterns?: string[];

  @ApiPropertyOptional({
    description: 'Path patterns to exclude (tags, categories, pagination, ...)',
    example: ['/tag/*', '/category/*'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_URL_ARRAY_SIZE)
  @IsString({ each: true })
  excludedPathPatterns?: string[];
}

export class WebConfigResponseDto {
  @ApiPropertyOptional({
    description: 'Entry/listing page URLs used for discovery and crawling',
    example: ['https://example.com/blog'],
    type: [String],
  })
  entryUrls: string[] | null;

  @ApiPropertyOptional({
    description: 'Sitemap URL used for discovery, if any',
    example: 'https://example.com/sitemap.xml',
  })
  sitemapUrl: string | null;

  @ApiPropertyOptional({
    description: 'Discovery method currently in use for this source',
    enum: WebDiscoveryMethod,
    example: WebDiscoveryMethod.SITEMAP,
  })
  preferredDiscoveryMethod: WebDiscoveryMethod | null;

  @ApiPropertyOptional({
    description: 'Extraction method currently in use for this source',
    enum: WebExtractionMethod,
    example: WebExtractionMethod.READABILITY,
  })
  preferredExtractionMethod: WebExtractionMethod | null;

  @ApiPropertyOptional({
    description: 'CSS selector for article links on a listing page',
    example: 'article.post h2 a',
  })
  articleLinkSelector: string | null;

  @ApiPropertyOptional({
    description: 'CSS selector for the article body, used as a Readability fallback',
    example: 'article.post-content',
  })
  articleContentSelector: string | null;

  @ApiPropertyOptional({
    description: 'CSS selector for a "next page" link on paginated listings',
    example: 'a.next-page',
  })
  nextPageSelector: string | null;

  @ApiPropertyOptional({
    description: 'Path patterns explicitly allowed as articles',
    example: ['/blog/*'],
    type: [String],
  })
  allowedPathPatterns: string[] | null;

  @ApiPropertyOptional({
    description: 'Path patterns to exclude (tags, categories, pagination, ...)',
    example: ['/tag/*', '/category/*'],
    type: [String],
  })
  excludedPathPatterns: string[] | null;

  @ApiPropertyOptional({
    description: 'When discovery/extraction was last confirmed to work',
    example: '2026-07-01T12:00:00.000Z',
  })
  lastValidatedAt: Date | null;
}
