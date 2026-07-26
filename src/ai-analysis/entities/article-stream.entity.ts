import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Article } from '../../articles/entities/article.entity';
import { ContentStream } from '../../taxonomy/entities/content-stream.entity';

// FKs directly against Article (not through ArticleAnalysis) — mirrors ArticleTechnologyInterest.
// `isPrimary` must always agree with ArticleAnalysis.mainStreamId for the same article — both are
// written together inside one transaction in AiAnalysisService, and a partial unique index
// (IDX_article_streams_primary_per_article, hand-added in the GlobalArticleAnalysisRework
// migration) guarantees at most one primary stream row per article at the DB level.
@Entity('article_streams')
@Unique(['articleId', 'streamId'])
export class ArticleStream {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  articleId: string;

  @ManyToOne(() => Article, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'articleId' })
  article: Article;

  @Column({ type: 'uuid' })
  streamId: string;

  @ManyToOne(() => ContentStream, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'streamId' })
  stream: ContentStream;

  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
