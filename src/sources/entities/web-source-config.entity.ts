import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Source } from './source.entity';

export enum WebDiscoveryMethod {
  RSS = 'rss',
  ATOM = 'atom',
  SITEMAP = 'sitemap',
  CHEERIO = 'cheerio',
  PLAYWRIGHT = 'playwright',
}

export enum WebExtractionMethod {
  READABILITY = 'readability',
  CHEERIO_SELECTOR = 'cheerio_selector',
  PLAYWRIGHT = 'playwright',
}

@Entity('web_source_configs')
export class WebSourceConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  sourceId: string;

  @OneToOne(() => Source, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sourceId' })
  source: Source;

  @Column({ type: 'jsonb', nullable: true })
  entryUrls: string[] | null;

  @Column({ type: 'varchar', nullable: true })
  sitemapUrl: string | null;

  @Column({
    type: 'enum',
    enum: WebDiscoveryMethod,
    nullable: true,
  })
  preferredDiscoveryMethod: WebDiscoveryMethod | null;

  @Column({
    type: 'enum',
    enum: WebExtractionMethod,
    nullable: true,
  })
  preferredExtractionMethod: WebExtractionMethod | null;

  @Column({ type: 'varchar', nullable: true })
  articleLinkSelector: string | null;

  @Column({ type: 'varchar', nullable: true })
  articleContentSelector: string | null;

  @Column({ type: 'varchar', nullable: true })
  nextPageSelector: string | null;

  @Column({ type: 'jsonb', nullable: true })
  allowedPathPatterns: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  excludedPathPatterns: string[] | null;

  @Column({ type: 'timestamp', nullable: true })
  lastValidatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
