import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DigestItem } from './digest-item.entity';

export enum DigestType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  DEEP_DIVE_WEEKLY = 'deep_dive_weekly',
}

export enum DigestStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  FAILED = 'failed',
}

@Entity('digests')
export class Digest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: DigestType, default: DigestType.DAILY })
  type: DigestType;

  @Column({ type: 'timestamp' })
  periodStart: Date;

  @Column({ type: 'timestamp' })
  periodEnd: Date;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  intro: string;

  @Column({ type: 'text' })
  htmlBody: string;

  @Column({ type: 'text' })
  textBody: string;

  @Column({ type: 'enum', enum: DigestStatus, default: DigestStatus.DRAFT })
  status: DigestStatus;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @OneToMany(() => DigestItem, (item) => item.digest)
  items: DigestItem[];

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
