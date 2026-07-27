import { UserRole } from '../../users/entities/user.entity';

// Attached to `request.user` by JwtStrategy.validate() (human users) or HybridAuthGuard's
// synthetic machine-client user (API-key callers).
export interface CurrentUserPayload {
  id: string;
  email: string;
  role: UserRole;
  // Projected from the already-loaded User row in JwtStrategy.validate() — no extra query.
  // Consumed by OnboardingCompletedGuard (src/feed/guards/) to gate the Personal Feed endpoint.
  onboardingCompletedAt: Date | null;
}
