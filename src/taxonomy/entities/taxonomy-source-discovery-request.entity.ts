import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TechnologyInterest } from './technology-interest.entity';

export enum TaxonomySourceDiscoveryStatus {
  PENDING_MANUAL_REVIEW = 'pending_manual_review',
}

// One row per taxonomy-source-discovery queue job (see QueueService.addTaxonomySourceDiscoveryJob
// and TaxonomySourceDiscoveryProcessor). This phase has no real web-search integration — the
// processor only records that a newly-created TechnologyInterest needs a source suggested for it,
// for an operator to action manually. Real automated search is a later phase's job.
@Entity('taxonomy_source_discovery_requests')
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
    default: TaxonomySourceDiscoveryStatus.PENDING_MANUAL_REVIEW,
  })
  status: TaxonomySourceDiscoveryStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
