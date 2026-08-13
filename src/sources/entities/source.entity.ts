import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SourceType {
  RSS = 'rss',
  ATOM = 'atom',
  GITHUB_RELEASE = 'github_release',
  WEB = 'web',
}

export enum SourceCategory {
  BACKEND_ARCHITECTURE_INFRA = 'backend_architecture_infra',
  ENGINEERING_DEEP_DIVES = 'engineering_deep_dives',
  NODE_TYPESCRIPT_NESTJS = 'node_typescript_nestjs',
  AI_ENGINEERING = 'ai_engineering',
}

export enum SourceStatus {
  ACTIVE = 'active',
  DEGRADED = 'degraded',
  DISABLED = 'disabled',
}

@Entity('sources')
export class Source {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  url: string;

  @Column({ type: 'enum', enum: SourceType })
  type: SourceType;

  @Column({ type: 'enum', enum: SourceCategory })
  category: SourceCategory;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'enum', enum: SourceStatus, default: SourceStatus.ACTIVE })
  status: SourceStatus;

  @Column({ type: 'int', default: 0 })
  consecutiveFailures: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 50 })
  trustScore: number;

  @Column({ type: 'timestamp', nullable: true, default: null })
  lastCheckedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  lastSuccessfulFetchAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  lastAttemptAt: Date | null;

  @Column({ type: 'text', nullable: true, default: null })
  lastError: string | null;

  @Column({ type: 'int', default: 0 })
  processedArticleCount: number;

  @Column({ type: 'varchar', nullable: true, default: null })
  canonicalUrl: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  feedUrl: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  repositoryOwner: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  repositoryName: string | null;

  @Column({ type: 'int', default: 0 })
  globalUsefulCount: number;

  @Column({ type: 'int', default: 0 })
  globalNotUsefulCount: number;

  @Column({ type: 'int', default: 0 })
  globalSavedCount: number;

  @Column({ type: 'int', default: 0 })
  globalOpenedCount: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, default: 0 })
  globalInteractionScore: number;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
