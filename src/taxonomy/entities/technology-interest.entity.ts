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

// Technologies/interests are never hard-deleted, only edited or merged (see
// TechnologyInterestCommandService.merge) — deletedAt + mergedIntoId are set together on the
// losing row of a merge, never on a standalone delete.
@Entity('technology_interests')
@Unique(['kind', 'normalizedName'])
export class TechnologyInterest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: TechnologyInterestKind })
  kind: TechnologyInterestKind;

  @Column({ type: 'varchar' })
  name: string;

  // Lowercase/trim/collapsed-internal-whitespace of `name`, but punctuation that's meaningful to
  // the identity of a technology name (".", "#", "+") is preserved — see
  // `normalizeTechnologyInterestName` in `util/normalize-technology-interest-name.util.ts`.
  @Column({ type: 'varchar' })
  normalizedName: string;

  // Alternate normalized strings folded in during resolve/merge (e.g. a similarity match below
  // the exact/alias tiers gets its input string appended here so the next identical input is an
  // alias hit instead of another similarity search).
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
