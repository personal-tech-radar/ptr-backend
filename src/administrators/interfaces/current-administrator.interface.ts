export interface CurrentAdministrator {
  id: string;
  email: string;
  tokenVersion: number;
  jti: string;
  expiresAt: Date;
}
