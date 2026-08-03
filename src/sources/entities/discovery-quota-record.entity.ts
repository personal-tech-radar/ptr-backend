import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum DiscoveryOperationType {
  TECHNOLOGY = 'technology',
  INTEREST = 'interest',
  SOURCE_URL = 'source_url',
}

@Entity('discovery_quota_records')
@Index(['userId', 'createdAt'])
@Unique(['userId', 'idempotencyKey'])
export class DiscoveryQuotaRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: DiscoveryOperationType })
  operationType: DiscoveryOperationType;

  @Column({ type: 'varchar' })
  idempotencyKey: string;

  @CreateDateColumn()
  createdAt: Date;
}
