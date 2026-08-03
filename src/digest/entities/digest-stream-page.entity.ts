import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ContentStream } from '../../taxonomy/entities/content-stream.entity';
import { Digest } from './digest.entity';

@Entity('digest_stream_pages')
@Unique(['digestId', 'streamId'])
export class DigestStreamPage {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) digestId: string;
  @ManyToOne(() => Digest, (digest) => digest.streamPages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'digestId' })
  digest: Digest;

  @Column({ type: 'uuid' }) streamId: string;
  @ManyToOne(() => ContentStream)
  @JoinColumn({ name: 'streamId' })
  stream: ContentStream;

  @CreateDateColumn() createdAt: Date;
}
