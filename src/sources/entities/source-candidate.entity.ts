import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Article } from '../../articles/entities/article.entity';

export enum SourceCandidateStatus {
  PENDING = 'pending',
  VALIDATED = 'validated',
  REJECTED = 'rejected',
  PROMOTED = 'promoted',
  NEEDS_REVIEW = 'needs_review',
}

export enum SourceCandidateDetectedType {
  RSS = 'rss',
  ATOM = 'atom',
  WEB = 'web',
}

@Entity('source_candidates')
export class SourceCandidate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  normalizedUrl: string;

  @Column()
  domain: string;

  @Column({ type: 'uuid', nullable: true })
  discoveredFromArticleId: string | null;

  @ManyToOne(() => Article, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'discoveredFromArticleId' })
  discoveredFromArticle: Article | null;

  @Column({ type: 'varchar', nullable: true })
  seedKey: string | null;

  @Column({
    type: 'enum',
    enum: SourceCandidateStatus,
    default: SourceCandidateStatus.PENDING,
  })
  status: SourceCandidateStatus;

  @Column({
    type: 'enum',
    enum: SourceCandidateDetectedType,
    nullable: true,
  })
  detectedType: SourceCandidateDetectedType | null;

  @Column({ type: 'jsonb', nullable: true })
  proposedConfig: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  validationError: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastValidatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
