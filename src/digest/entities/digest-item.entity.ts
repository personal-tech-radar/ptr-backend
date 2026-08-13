import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Digest } from './digest.entity';
import { Article } from '../../articles/entities/article.entity';
import { ScoringResultBreakdown } from '../../scoring/scoring.types';

@Entity('digest_items')
export class DigestItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  digestId: string;

  @ManyToOne(() => Digest, (digest) => digest.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'digestId' })
  digest: Digest;

  @Column()
  articleId: string;

  @ManyToOne(() => Article)
  @JoinColumn({ name: 'articleId' })
  article: Article;

  @Column()
  position: number;

  @Column({ type: 'jsonb', nullable: true, default: null })
  scoreBreakdown: ScoringResultBreakdown | null;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
