import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Source } from '../../sources/entities/source.entity';

export enum ArticleStatus {
  NEW = 'new',
  DUPLICATE = 'duplicate',
  PENDING_ANALYSIS = 'pending_analysis',
  ANALYZED = 'analyzed',
  REJECTED = 'rejected',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

export enum ContentExtractionMethod {
  RSS = 'rss',
  READABILITY = 'readability',
  CHEERIO_SELECTOR = 'cheerio_selector',
  PLAYWRIGHT = 'playwright',
}

@Entity('articles')
export class Article {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sourceId: string;

  @ManyToOne(() => Source, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sourceId' })
  source: Source;

  @Column()
  title: string;

  @Column()
  url: string;

  @Column({ unique: true })
  urlHash: string;

  @Column()
  titleHash: string;

  @Column({ type: 'text', nullable: true })
  author: string | null;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  summaryFromFeed: string | null;

  @Column({ type: 'text', nullable: true })
  rawContent: string | null;

  @Column({ type: 'enum', enum: ArticleStatus, default: ArticleStatus.NEW })
  status: ArticleStatus;

  @Column({
    type: 'enum',
    enum: ContentExtractionMethod,
    default: ContentExtractionMethod.RSS,
  })
  contentExtractionMethod: ContentExtractionMethod;

  @Column({ type: 'jsonb', nullable: true })
  contentExtractionConfig: Record<string, unknown> | null;

  @Column({ type: 'timestamp', nullable: true })
  contentFetchedAt: Date | null;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
