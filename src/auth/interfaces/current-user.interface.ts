export interface CurrentUserPayload {
  id: string;
  email: string;
  subjectType: 'user';
  emailVerifiedAt: Date | null;
  // Projected from the already-loaded User row in JwtStrategy.validate() — no extra query.
  // Consumed by OnboardingCompletedGuard (src/feed/guards/) to gate the Personal Feed endpoint.
  onboardingCompletedAt: Date | null;
}
