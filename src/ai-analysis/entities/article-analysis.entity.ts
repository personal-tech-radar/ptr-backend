import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Article } from '../../articles/entities/article.entity';

@Entity('article_analyses')
export class ArticleAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  articleId: string;

  @OneToOne(() => Article)
  @JoinColumn({ name: 'articleId' })
  article: Article;

  @Column({ type: 'text' })
  shortSummary: string;

  @Column({ type: 'text' })
  whyItMatters: string;

  @Column({ type: 'text' })
  practicalValue: string;

  @Column('simple-array')
  tags: string[];

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  relevanceScore: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  qualityScore: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  finalScore: number;

  @Column({ default: false })
  shouldIncludeInDailyDigest: boolean;

  @Column({ default: false })
  shouldIncludeInWeeklyDigest: boolean;

  @Column({ default: false })
  shouldIncludeInDeepDiveDigest: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  deepDiveScore: number;

  @Column({ type: 'varchar', default: 'basic' })
  complexityLevel: string;

  @Column('simple-array', { default: '' })
  matchedInterests: string[];

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
