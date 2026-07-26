import type { JwtSignOptions } from '@nestjs/jwt';

// `jsonwebtoken`'s expiresIn type (via `ms`'s StringValue) can't be satisfied by a plain
// env-sourced string at the type level; the runtime value (e.g. "15m", "30d") is valid
// regardless. Centralizing the cast here keeps the `as unknown as` narrowing in one place.
export function toExpiresIn(value: string): JwtSignOptions['expiresIn'] {
  return value as unknown as JwtSignOptions['expiresIn'];
}
