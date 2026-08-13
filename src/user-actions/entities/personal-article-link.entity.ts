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

// Identify the user-visible surface that generated each permanent link.
export enum PersonalArticleLinkContext {
  FEED = 'feed',
  DAILY_DIGEST = 'daily_digest',
  WEEKLY_DIGEST = 'weekly_digest',
  DIGEST_STREAM_PAGE = 'digest_stream_page',
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

  @Column({ type: 'uuid', nullable: true })
  digestId: string | null;

  @Column({ type: 'text', nullable: true })
  originalUrl: string | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  firstOpenedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
