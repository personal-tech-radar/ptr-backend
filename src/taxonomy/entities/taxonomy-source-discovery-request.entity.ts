import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TechnologyInterest } from './technology-interest.entity';

export enum TaxonomySourceDiscoveryStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// One row represents the logical operation; BullMQ retries update its attempt metadata.
@Entity('taxonomy_source_discovery_requests')
@Index('UQ_taxonomy_discovery_request_taxonomy', ['technologyInterestId'], { unique: true })
export class TaxonomySourceDiscoveryRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  technologyInterestId: string;

  @ManyToOne(() => TechnologyInterest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'technologyInterestId' })
  technologyInterest: TechnologyInterest;

  @CreateDateColumn()
  requestedAt: Date;

  @Column({
    type: 'enum',
    enum: TaxonomySourceDiscoveryStatus,
    default: TaxonomySourceDiscoveryStatus.QUEUED,
  })
  status: TaxonomySourceDiscoveryStatus;

  @Column({ type: 'integer', default: 0 })
  attemptCount: number;

  @Column({ type: 'integer', default: 0 })
  retryCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastAttemptAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  failedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
