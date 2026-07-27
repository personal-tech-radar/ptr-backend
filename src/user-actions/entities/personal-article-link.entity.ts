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
import { User } from '../../users/entities/user.entity';

// Mirrors DigestType's real values (daily/weekly/deep_dive_weekly, see digest.entity.ts) 1:1,
// plus FEED — a personal link context that isn't a digest at all — so link analytics can tell
// where a permanent per-user article link was generated from.
export enum PersonalArticleLinkContext {
  FEED = 'feed',
  DAILY_DIGEST = 'daily_digest',
  WEEKLY_DIGEST = 'weekly_digest',
  DEEP_DIVE_WEEKLY_DIGEST = 'deep_dive_weekly_digest',
}

@Entity('personal_article_links')
@Unique(['userId', 'articleId', 'context'])
export class PersonalArticleLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  articleId: string;

  @ManyToOne(() => Article, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'articleId' })
  article: Article;

  @Column({ type: 'enum', enum: PersonalArticleLinkContext })
  context: PersonalArticleLinkContext;

  @Column({ type: 'timestamp', nullable: true, default: null })
  firstOpenedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
