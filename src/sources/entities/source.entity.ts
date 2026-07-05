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

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 50 })
  trustScore: number;

  @Column({ type: 'timestamp', nullable: true, default: null })
  lastCheckedAt: Date | null;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
