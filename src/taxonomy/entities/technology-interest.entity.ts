import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export enum TechnologyInterestKind {
  TECHNOLOGY = 'technology',
  INTEREST = 'interest',
}

// Taxonomy rows are edited or merged, never hard-deleted.
@Entity('technology_interests')
@Unique(['kind', 'normalizedName'])
export class TechnologyInterest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: TechnologyInterestKind })
  kind: TechnologyInterestKind;

  @Column({ type: 'varchar' })
  name: string;

  // Normalized identity preserves meaningful punctuation such as ., #, and +.
  @Column({ type: 'varchar' })
  normalizedName: string;

  // Alternate normalized names learned during resolution or merge.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  aliases: string[];

  @Column({ type: 'uuid', nullable: true, default: null })
  mergedIntoId: string | null;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
