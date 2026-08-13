import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserLevel {
  JUNIOR = 'junior',
  MIDDLE = 'middle',
  SENIOR = 'senior',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar' })
  passwordHash: string;

  @Column({ type: 'varchar' })
  displayName: string;

  // IANA timezone string, e.g. "Europe/Berlin".
  @Column({ type: 'varchar', nullable: true })
  timezone: string | null;

  @Column({ type: 'varchar', nullable: true })
  githubUrl: string | null;

  // Onboarding maps this profile level to article difficulty.
  @Column({ type: 'enum', enum: UserLevel, nullable: true })
  level: UserLevel | null;

  @Column({ type: 'boolean', default: false })
  dailyDigestEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  weeklyDigestEnabled: boolean;

  @Column({ type: 'timestamp', nullable: true, default: null })
  emailVerifiedAt: Date | null;

  // Feed and digest eligibility requires this timestamp.
  @Column({ type: 'timestamp', nullable: true, default: null })
  onboardingCompletedAt: Date | null;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
