import { Column, DeleteDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { InfoPageDocument } from '../models/info-page-document.model';

@Entity('info_pages')
export class InfoPage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'jsonb' })
  fullText: InfoPageDocument;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;
}
