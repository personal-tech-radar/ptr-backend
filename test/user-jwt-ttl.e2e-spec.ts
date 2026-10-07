import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';

describe('User JWT lifetime over HTTP', () => {
  const userId = randomUUID();
  const email = `jwt-ttl-${userId}@example.invalid`;
  const password = `JwtFixture-${userId}`;
  const base = process.env.ADMIN_E2E_BASE_URL || 'http://localhost:3000';
  let db: DataSource;

  beforeAll(async () => {
    db = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      synchronize: false,
    });
    await db.initialize();
    await db.query(
      'INSERT INTO users (id,email,"passwordHash","displayName") VALUES ($1,$2,$3,$4)',
      [userId, email, await bcrypt.hash(password, 10), 'JWT lifetime fixture'],
    );
  });

  afterAll(async () => {
    if (!db?.isInitialized) return;
    await db.query('DELETE FROM refresh_tokens WHERE "userId"=$1', [userId]);
    await db.query('DELETE FROM users WHERE id=$1', [userId]);
    await db.destroy();
  });

  const lifetime = (token: string): number => {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as {
      iat: number;
      exp: number;
    };
    return payload.exp - payload.iat;
  };

  it('issues 24-hour access JWTs on login and refresh', async () => {
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const first = (await login.json()) as { accessToken: string; refreshToken: string };
    expect(lifetime(first.accessToken)).toBe(24 * 60 * 60);

    const refresh = await fetch(`${base}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: first.refreshToken }),
    });
    expect(refresh.status).toBe(200);
    const next = (await refresh.json()) as { accessToken: string };
    expect(lifetime(next.accessToken)).toBe(24 * 60 * 60);
  });
});
