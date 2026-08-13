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

export enum PermanentArticleActionType {
  SAVE = 'save',
  USEFUL = 'useful',
  NOT_USEFUL = 'not_useful',
}

@Entity('permanent_article_actions')
@Unique(['userId', 'articleId', 'type'])
export class PermanentArticleAction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' }) userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' }) articleId: string;
  @ManyToOne(() => Article, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'articleId' })
  article: Article;

  @Column({ type: 'enum', enum: PermanentArticleActionType })
  type: PermanentArticleActionType;

  @Column({ type: 'timestamp', nullable: true, default: null })
  lastUsedAt: Date | null;

  @CreateDateColumn() createdAt: Date;
}
