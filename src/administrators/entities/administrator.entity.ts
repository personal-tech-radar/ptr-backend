import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('administrators')
export class Administrator {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar' })
  passwordHash: string;

  @Column({ type: 'integer', default: 0 })
  tokenVersion: number;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  createdByAdminId: string | null;

  @ManyToOne(() => Administrator, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdByAdminId' })
  createdByAdministrator: Administrator | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
