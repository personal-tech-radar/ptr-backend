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
import { TechnologyInterest } from '../../taxonomy/entities/technology-interest.entity';

// FKs directly against Article (not through ArticleAnalysis) — mirrors ArticleFeedback's shape,
// so these rows stay valid even before Stage 2 (full analysis) has run for the article.
@Entity('article_technology_interests')
@Unique(['articleId', 'technologyInterestId'])
export class ArticleTechnologyInterest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  articleId: string;

  @ManyToOne(() => Article, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'articleId' })
  article: Article;

  @Column({ type: 'uuid' })
  technologyInterestId: string;

  @ManyToOne(() => TechnologyInterest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'technologyInterestId' })
  technologyInterest: TechnologyInterest;

  @CreateDateColumn()
  createdAt: Date;
}
