import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Source } from './source.entity';

@Entity('source_ingestion_attempts')
@Index(['sourceId', 'startedAt'])
export class SourceIngestionAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sourceId: string;

  @ManyToOne(() => Source, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sourceId' })
  source: Source;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  streamIds: string[];

  @Column({ type: 'timestamp' })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true, default: null })
  completedAt: Date | null;

  @Column({ type: 'boolean', nullable: true, default: null })
  succeeded: boolean | null;

  @Column({ type: 'int', default: 0 })
  publicationsProcessed: number;

  @Column({ type: 'text', nullable: true, default: null })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
