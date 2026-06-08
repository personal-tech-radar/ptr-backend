import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Article } from './article.entity';

export enum ArticleFeedbackType {
  USEFUL = 'useful',
  NOT_USEFUL = 'not_useful',
}

@Entity('article_feedbacks')
@Unique(['articleId', 'userId'])
export class ArticleFeedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  articleId: string;

  @ManyToOne(() => Article, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'articleId' })
  article: Article;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'enum', enum: ArticleFeedbackType })
  type: ArticleFeedbackType;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
