import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Content streams are a fixed, curated set (see the CreateTaxonomyTables migration's seed insert)
// — never deleted, only edited via a later admin surface, so there is no `deletedAt` column.
@Entity('content_streams')
export class ContentStream {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  key: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true, default: null })
  description: string | null;

  @Column({ type: 'int' })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
