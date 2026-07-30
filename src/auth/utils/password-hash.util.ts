import * as bcrypt from 'bcrypt';

// Single source of truth for password hashing cost, shared by AuthService and
// AdminBootstrapService so the two can never drift on salt rounds.
export const BCRYPT_SALT_ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_SALT_ROUNDS);
}
