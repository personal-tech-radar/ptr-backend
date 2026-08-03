import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SourceType } from './source.entity';
import { Source } from './source.entity';
import { User } from '../../users/entities/user.entity';
import { TechnologyInterest } from '../../taxonomy/entities/technology-interest.entity';
import { ContentStream } from '../../taxonomy/entities/content-stream.entity';

export enum SourceCandidateStatus {
  PENDING = 'pending',
  REJECTED = 'rejected',
  ACTIVE = 'active',
}

export enum SourceDiscoveryOrigin {
  USER_SUBMISSION = 'user_submission',
  TECHNOLOGY = 'technology',
  INTEREST = 'interest',
  SEED = 'seed',
}

export enum SourceCandidateRejectionCode {
  INVALID_URL = 'invalid_url',
  INACCESSIBLE = 'inaccessible',
  UNSUPPORTED_TYPE = 'unsupported_type',
  NO_PUBLICATIONS = 'no_publications',
  EXTRACTION_FAILED = 'extraction_failed',
  TAXONOMY_MISMATCH = 'taxonomy_mismatch',
  STREAM_MISMATCH = 'stream_mismatch',
  DUPLICATE = 'duplicate',
  PROCESSING_FAILED = 'processing_failed',
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

  @Column({ type: 'varchar', nullable: true })
  seedKey: string | null;

  @Column({ type: 'enum', enum: SourceDiscoveryOrigin, default: SourceDiscoveryOrigin.SEED })
  origin: SourceDiscoveryOrigin;

  @Column({ type: 'uuid', nullable: true, default: null })
  submittedByUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'submittedByUserId' })
  submittedByUser: User | null;

  @Column({ type: 'uuid', nullable: true, default: null })
  technologyInterestId: string | null;

  @ManyToOne(() => TechnologyInterest, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'technologyInterestId' })
  technologyInterest: TechnologyInterest | null;

  @Column({ type: 'uuid', nullable: true, default: null })
  contentStreamId: string | null;

  @ManyToOne(() => ContentStream, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'contentStreamId' })
  contentStream: ContentStream | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  proposedName: string | null;

  @Column({ type: 'enum', enum: SourceType, nullable: true, default: null })
  expectedSourceType: SourceType | null;

  @Column({ type: 'text', nullable: true, default: null })
  relevanceReason: string | null;

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

  @Column({ type: 'enum', enum: SourceCandidateRejectionCode, nullable: true, default: null })
  rejectionCode: SourceCandidateRejectionCode | null;

  @Column({ type: 'uuid', nullable: true, default: null })
  activatedSourceId: string | null;

  @ManyToOne(() => Source, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'activatedSourceId' })
  activatedSource: Source | null;

  @Column({ type: 'timestamp', nullable: true })
  lastValidatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
