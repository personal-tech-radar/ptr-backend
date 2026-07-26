import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

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
  @Column({ type: 'varchar' })
  timezone: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ type: 'varchar', nullable: true })
  githubUrl: string | null;

  // Wired up here so Phase 2 (Onboarding) doesn't need a second migration for basic profile
  // fields. Not user-settable via any endpoint in this phase.
  @Column({ type: 'enum', enum: UserLevel, nullable: true })
  level: UserLevel | null;

  @Column({ type: 'boolean', default: false })
  dailyDigestEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  weeklyDigestEnabled: boolean;

  @Column({ type: 'timestamp', nullable: true, default: null })
  emailVerifiedAt: Date | null;

  // Set by Phase 2's onboarding endpoint, not by anything in this phase.
  @Column({ type: 'timestamp', nullable: true, default: null })
  onboardingCompletedAt: Date | null;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
