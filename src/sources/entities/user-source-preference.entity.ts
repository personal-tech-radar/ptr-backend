import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Source } from './source.entity';

@Entity('user_source_preferences')
@Unique(['userId', 'sourceId'])
export class UserSourcePreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  sourceId: string;

  @ManyToOne(() => Source, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sourceId' })
  source: Source;

  @Column({ type: 'int', default: 0 })
  usefulCount: number;

  @Column({ type: 'int', default: 0 })
  notUsefulCount: number;

  @Column({ type: 'int', default: 0 })
  savedCount: number;

  @Column({ type: 'int', default: 0 })
  openedCount: number;

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 0 })
  feedbackAdjustment: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
