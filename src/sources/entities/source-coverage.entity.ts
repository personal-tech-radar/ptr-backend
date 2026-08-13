import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ContentStream } from '../../taxonomy/entities/content-stream.entity';
import { TechnologyInterest } from '../../taxonomy/entities/technology-interest.entity';
import { SourceDiscoveryOrigin } from './source-candidate.entity';
import { Source } from './source.entity';

@Entity('source_coverages')
@Unique(['sourceId', 'technologyInterestId', 'contentStreamId'])
export class SourceCoverage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sourceId: string;

  @ManyToOne(() => Source, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sourceId' })
  source: Source;

  @Column({ type: 'uuid' })
  technologyInterestId: string;

  @ManyToOne(() => TechnologyInterest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'technologyInterestId' })
  technologyInterest: TechnologyInterest;

  @Column({ type: 'uuid' })
  contentStreamId: string;

  @ManyToOne(() => ContentStream, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contentStreamId' })
  contentStream: ContentStream;

  @Column({ type: 'enum', enum: SourceDiscoveryOrigin })
  origin: SourceDiscoveryOrigin;

  @CreateDateColumn()
  discoveredAt: Date;
}
