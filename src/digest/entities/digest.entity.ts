import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { DigestItem } from './digest-item.entity';
import { DigestBuildDebug, DigestStats } from '../digest.types';
import { Administrator } from '../../administrators/entities/administrator.entity';
import { DigestStreamPage } from './digest-stream-page.entity';

export enum DigestType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
}

export enum DigestStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED_EMPTY = 'skipped_empty',
}

export enum DigestDeliveryMode {
  SCHEDULED = 'scheduled',
  ADMIN_PREVIEW = 'admin_preview',
}

@Entity('digests')
@Index(['userId', 'type', 'createdAt'])
@Index(['userId', 'type', 'periodKey'], { unique: true })
export class Digest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Nullable: pre-existing digest history from before this column was introduced was hard-deleted
  // by the migration that added it (see AddPersonalDigestDelivery), so in practice every row
  // going forward always has a userId — nullable only because the FK column itself can't be
  // added NOT NULL without a backfill on a table this migration already empties.
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'enum', enum: DigestType, default: DigestType.DAILY })
  type: DigestType;

  @Column({ type: 'varchar' })
  periodKey: string;

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

  @Column({ type: 'enum', enum: DigestDeliveryMode, default: DigestDeliveryMode.SCHEDULED })
  deliveryMode: DigestDeliveryMode;

  @Column({ type: 'uuid', nullable: true })
  triggeringAdministratorId: string | null;

  @ManyToOne(() => Administrator, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'triggeringAdministratorId' })
  triggeringAdministrator: Administrator | null;

  @Column({ type: 'varchar', nullable: true })
  actualRecipientEmail: string | null;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'jsonb', nullable: true, default: null })
  buildDebug: DigestBuildDebug | null;

  @Column({ type: 'jsonb', nullable: true, default: null })
  statisticsSnapshot: DigestStats | null;

  @OneToMany(() => DigestItem, (item) => item.digest)
  items: DigestItem[];

  @OneToMany(() => DigestStreamPage, (page) => page.digest)
  streamPages: DigestStreamPage[];

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
