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
import { TechnologyInterest } from './technology-interest.entity';

@Entity('user_technology_interests')
@Unique(['userId', 'technologyInterestId'])
export class UserTechnologyInterest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  technologyInterestId: string;

  @ManyToOne(() => TechnologyInterest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'technologyInterestId' })
  technologyInterest: TechnologyInterest;

  @CreateDateColumn()
  createdAt: Date;
}
