import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('article_relevances')
@Unique(['articleId', 'userId'])
export class ArticleRelevance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  articleId: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column()
  preAnalysisIsRelevant: boolean;

  @Column({ type: 'text' })
  preAnalysisReason: string;

  @Column({ type: 'timestamp' })
  preAnalysisAt: Date;

  @Column({ type: 'uuid', nullable: true })
  fullAnalysisId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
