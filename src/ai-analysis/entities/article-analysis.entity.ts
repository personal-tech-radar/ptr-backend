import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Article } from '../../articles/entities/article.entity';
import { ContentStream } from '../../taxonomy/entities/content-stream.entity';

export enum ArticleMaterialType {
  ARTICLE = 'article',
  TUTORIAL = 'tutorial',
  RELEASE_NOTES = 'release_notes',
  ANNOUNCEMENT = 'announcement',
  OPINION = 'opinion',
  CASE_STUDY = 'case_study',
  REFERENCE = 'reference',
}

export enum ArticleComplexityLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  ARCHITECT = 'architect',
}

// One row per article, created at Stage 1 (pre-screen) and completed in place by Stage 2 (full
// analysis) — see AiAnalysisService. `fullAnalysisAt` is the single source of truth for whether
// Stage 2 has run; every Stage-2-only column is nullable because a pre-screened-but-not-yet-fully-
// analyzed row (or one that failed pre-screen) legitimately has none of them populated.
@Entity('article_analyses')
export class ArticleAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  articleId: string;

  // onDelete: 'CASCADE' (a change from the pre-phase-3 FK, which was ON DELETE NO ACTION) —
  // required now that this row is created at Stage 1 for every article, including
  // SourceCandidatesService.promote()'s sample articles, which are hard-deleted once a candidate
  // is promoted. Without cascade, that hard delete would fail with a FK violation.
  @OneToOne(() => Article, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'articleId' })
  article: Article;

  @Column({ type: 'boolean', nullable: true })
  preScreenIsRelevant: boolean | null;

  @Column({ type: 'text', nullable: true })
  preScreenReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  preScreenAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  fullAnalysisAt: Date | null;

  @Column({ type: 'text', nullable: true })
  shortSummary: string | null;

  @Column({ type: 'text', nullable: true })
  whyItMatters: string | null;

  @Column({ type: 'text', nullable: true })
  practicalValue: string | null;

  @Column('simple-array', { nullable: true })
  tags: string[] | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  relevanceScore: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  qualityScore: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  finalScore: number | null;

  @Column({ default: false })
  shouldIncludeInDailyDigest: boolean;

  @Column({ default: false })
  shouldIncludeInWeeklyDigest: boolean;

  @Column({ type: 'enum', enum: ArticleComplexityLevel, nullable: true })
  complexityLevel: ArticleComplexityLevel | null;

  @Column({ type: 'enum', enum: ArticleMaterialType, nullable: true })
  materialType: ArticleMaterialType | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  urgencyScore: number | null;

  @Column({ type: 'boolean', default: false })
  evergreen: boolean;

  @Column({ type: 'boolean', default: false })
  breakingChanges: boolean;

  @Column({ type: 'jsonb', nullable: true })
  releaseData: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  securityData: Record<string, unknown> | null;

  @Column({ type: 'uuid', nullable: true })
  mainStreamId: string | null;

  @ManyToOne(() => ContentStream)
  @JoinColumn({ name: 'mainStreamId' })
  mainStream: ContentStream | null;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
