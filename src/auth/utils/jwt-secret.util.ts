// Single source of truth for the JWT signing/verification secret. Every component that signs or
// verifies an access token (AuthModule's JwtModule registration, JwtStrategy, AuthService) must
// read the secret through this helper rather than defaulting to a hardcoded literal — an unset
// JWT_SECRET in production must fail fast at startup, not silently fall back to a public,
// guessable default that would let anyone forge access tokens.
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not configured.');
  }
  return secret;
}
