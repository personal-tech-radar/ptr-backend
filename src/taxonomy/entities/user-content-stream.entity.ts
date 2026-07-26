import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ContentStream } from './content-stream.entity';

@Entity('user_content_streams')
@Unique(['userId', 'contentStreamId'])
export class UserContentStream {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  contentStreamId: string;

  @ManyToOne(() => ContentStream, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contentStreamId' })
  contentStream: ContentStream;

  @CreateDateColumn()
  createdAt: Date;
}
