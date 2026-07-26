import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  // SHA-256 hex digest of the opaque token sent to the user — the raw token is never persisted.
  @Column({ type: 'varchar' })
  tokenHash: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true, default: null })
  consumedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
