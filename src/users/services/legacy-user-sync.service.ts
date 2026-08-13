import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { Repository } from 'typeorm';
import { ArticleFeedbackService } from '../../articles/services/article-feedback.service';
import { hashPassword } from '../../auth/utils/password-hash.util';
import { LoggingService } from '../../common/logging/logging.service';
import { UserSourcePreferenceService } from '../../sources/services/user-source-preference.service';
import { ContentStreamQueryService } from '../../taxonomy/services/content-stream-query.service';
import { TechnologyInterestKind } from '../../taxonomy/entities/technology-interest.entity';
import { OnboardingDto } from '../dto/onboarding.dto';
import { User, UserLevel } from '../entities/user.entity';
import { OnboardingService } from './onboarding.service';
import { UserCommandService } from './user-command.service';
import { UserQueryService } from './user-query.service';

// The literal every ArticleFeedback/UserSourcePreference row historically carried before this
// phase gave feedback submission a real per-user identity (see the retired DEFAULT_USER_ID
// constant, deleted this phase). Scoped to this one-off retag only — deliberately not
// resurrected as a shared constant elsewhere in the codebase.
const LEGACY_DEFAULT_USER_ID = 'default_user';

// Fixed, known initial credential for this one specific legacy single-owner account, per explicit
// product decision (MVP3 Phase 11) — not sourced from env, unlike ADMIN_PASSWORD, since this is a
// one-time bootstrap for a named individual account rather than an operator-configurable secret.
// Hashed via the same hashPassword() the real registration/AdminBootstrapService flow uses before
// ever touching the database. The account holder is expected to change this after first login.
const LEGACY_USER_INITIAL_PASSWORD = 'Admin2026';

export interface LegacyUserManifestEntry {
  email: string;
  role: string;
  timezone: string;
  level: string;
  githubUrl: string;
  dailyDigestEnabled: boolean;
  weeklyDigestEnabled: boolean;
  contentStreamKeys: string[];
  technologyInterests: { kind: string; name: string }[];
}

interface LegacyUserManifestShape {
  version: number;
  user: LegacyUserManifestEntry;
}

export interface LegacyUserSyncSummary {
  userId: string;
  email: string;
  created: boolean;
  retaggedArticleFeedbackCount: number;
  retaggedUserSourcePreferenceCount: number;
}

export function loadLegacyUserManifest(cwd: string = process.cwd()): LegacyUserManifestEntry {
  const manifestPath = path.join(cwd, 'config', 'legacy-user.manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`No legacy user manifest found at ${manifestPath}`);
  }

  const raw = readFileSync(manifestPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!isLegacyUserManifestShape(parsed)) {
    throw new Error(`${manifestPath} is not a valid { version, user: {...} } manifest`);
  }

  validateLegacyUserManifestEntry(parsed.user);
  return parsed.user;
}

function isLegacyUserManifestShape(parsed: unknown): parsed is LegacyUserManifestShape {
  return (
    !!parsed &&
    typeof parsed === 'object' &&
    typeof (parsed as Record<string, unknown>)['version'] === 'number' &&
    typeof (parsed as Record<string, unknown>)['user'] === 'object'
  );
}

// This sync builds its DTOs by hand and calls services directly, bypassing the HTTP layer's
// ValidationPipe — nothing else enforces the manifest entry's contract, so it's validated
// explicitly up front (mirrors validateManifestEntry in source-sync.service.ts).
function validateLegacyUserManifestEntry(entry: LegacyUserManifestEntry): void {
  const fail = (message: string): never => {
    throw new Error(`Legacy user manifest entry: ${message}`);
  };

  if (!entry.email || typeof entry.email !== 'string') fail('email is required');
  if (entry.role !== 'user') fail('role must be "user"');
  if (!entry.timezone || typeof entry.timezone !== 'string') fail('timezone is required');
  if (!Object.values(UserLevel).includes(entry.level as UserLevel)) {
    fail(`level "${entry.level}" is not a valid UserLevel`);
  }
  if (!entry.githubUrl || typeof entry.githubUrl !== 'string') fail('githubUrl is required');
  if (typeof entry.dailyDigestEnabled !== 'boolean') fail('dailyDigestEnabled must be a boolean');
  if (typeof entry.weeklyDigestEnabled !== 'boolean') fail('weeklyDigestEnabled must be a boolean');
  if (!Array.isArray(entry.contentStreamKeys) || entry.contentStreamKeys.length === 0) {
    fail('contentStreamKeys must be a non-empty array');
  }
  if (!Array.isArray(entry.technologyInterests) || entry.technologyInterests.length === 0) {
    fail('technologyInterests must be a non-empty array');
  }
  for (const selection of entry.technologyInterests) {
    if (!Object.values(TechnologyInterestKind).includes(selection.kind as TechnologyInterestKind)) {
      fail(
        `technologyInterests entry kind "${selection.kind}" is not a valid TechnologyInterestKind`,
      );
    }
    if (!selection.name || typeof selection.name !== 'string') {
      fail('technologyInterests entry name is required');
    }
  }
}

// Idempotent, re-runnable sync for the one legacy single-owner account (MVP3 Phase 11) — the real
// per-user identity that replaces the retired DEFAULT_USER_ID placeholder. Mirrors
// AdminBootstrapService's find/create/resurrect-if-soft-deleted pattern (Phase 9), but never
// grants the admin role: unlike AdminBootstrapService.resurrectAsAdmin, a soft-deleted row is
// restored and reactivated here without touching its role. Also performs the one-off retag of
// every legacy `default_user`-owned ArticleFeedback/UserSourcePreference row onto this account's
// real id — this MUST run and be verified before the LinkArticleFeedbackAndUserSourcePreferencesToUsers
// migration, which converts those tables' userId columns to a uuid FK and will fail loudly if any
// row still holds the literal string.
@Injectable()
export class LegacyUserSyncService {
  private readonly logger = new LoggingService(LegacyUserSyncService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly userCommandService: UserCommandService,
    private readonly userQueryService: UserQueryService,
    private readonly onboardingService: OnboardingService,
    private readonly contentStreamQueryService: ContentStreamQueryService,
    private readonly articleFeedbackService: ArticleFeedbackService,
    private readonly userSourcePreferenceService: UserSourcePreferenceService,
  ) {}

  // `entry` defaults to the real manifest on disk but is accepted as a parameter (mirroring
  // SourceSyncService.syncAll's `entries` parameter) so tests can exercise this method against an
  // in-memory fixture without touching the filesystem.
  async sync(
    entry: LegacyUserManifestEntry = loadLegacyUserManifest(),
  ): Promise<LegacyUserSyncSummary> {
    const email = entry.email.trim().toLowerCase();

    const { user, created } = await this.findOrCreateUser(email);

    await this.userCommandService.updateProfile(user.id, {
      timezone: entry.timezone,
      githubUrl: entry.githubUrl,
      level: entry.level as UserLevel,
    });

    await this.applyDirectFields(user, entry);

    const contentStreamIds = await this.resolveContentStreamIds(entry.contentStreamKeys);
    const onboardingDto: OnboardingDto = {
      timezone: user.timezone ?? entry.timezone,
      level: entry.level as UserLevel,
      technologyInterests: entry.technologyInterests.map((selection) => ({
        kind: selection.kind as TechnologyInterestKind,
        name: selection.name,
      })),
      contentStreamIds,
    };
    await this.onboardingService.completeOnboarding(user.id, onboardingDto);

    const retaggedArticleFeedbackCount = await this.articleFeedbackService.retagLegacyUser(
      LEGACY_DEFAULT_USER_ID,
      user.id,
    );
    const retaggedUserSourcePreferenceCount =
      await this.userSourcePreferenceService.retagLegacyUser(LEGACY_DEFAULT_USER_ID, user.id);

    this.logger.info('Legacy user sync complete', {
      userId: user.id,
      email,
      created,
      retaggedArticleFeedbackCount,
      retaggedUserSourcePreferenceCount,
    });

    return {
      userId: user.id,
      email,
      created,
      retaggedArticleFeedbackCount,
      retaggedUserSourcePreferenceCount,
    };
  }

  private async findOrCreateUser(email: string): Promise<{ user: User; created: boolean }> {
    const existing = await this.userQueryService.findByEmailIncludingDeleted(email);

    if (existing && !existing.deletedAt) {
      this.logger.info('Legacy user already exists, leaving password untouched', {
        userId: existing.id,
      });
      return { user: existing, created: false };
    }

    if (existing && existing.deletedAt) {
      await this.userRepo.restore(existing.id);
      const restored = await this.userRepo.findOne({
        where: { id: existing.id },
        withDeleted: true,
      });
      if (!restored) {
        throw new Error(`Legacy user ${existing.id} not found immediately after restore`);
      }
      this.logger.info('Restored soft-deleted legacy user', { userId: restored.id });
      return { user: restored, created: false };
    }

    const passwordHash = await hashPassword(LEGACY_USER_INITIAL_PASSWORD);
    const created = await this.userCommandService.create({
      email,
      passwordHash,
      // Not part of the manifest (User.displayName is required/non-null); inferred once from the
      // account holder's known identity rather than left for a human to fill in post-creation.
      displayName: 'Miter Sidorov',
      timezone: 'UTC', // overwritten by updateProfile immediately after creation
      // Hardcoded rather than read from entry.role (validated in validateLegacyUserManifestEntry
      // but deliberately not consumed here): editing the manifest file alone must never be able to
      // grant admin. Only AdminBootstrapService's own ADMIN_EMAIL/ADMIN_PASSWORD path can do that.
      emailVerifiedAt: new Date(),
    });
    this.logger.info('Legacy user created', { userId: created.id });
    return { user: created, created: true };
  }

  // Fields not covered by UserCommandService.updateProfile/OnboardingService.completeOnboarding —
  // written directly via the repository per this codebase's "no repository layer" convention.
  // emailVerifiedAt is only set if not already present (never clobbers/un-verifies an existing
  // account on a re-run); the digest toggles are unconditionally reasserted to true every run,
  // since there is no self-service toggle endpoint yet that could legitimately have changed them.
  private async applyDirectFields(user: User, entry: LegacyUserManifestEntry): Promise<void> {
    await this.userRepo.update(user.id, {
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      dailyDigestEnabled: entry.dailyDigestEnabled,
      weeklyDigestEnabled: entry.weeklyDigestEnabled,
    });
  }

  private async resolveContentStreamIds(keys: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const key of keys) {
      const stream = await this.contentStreamQueryService.findByKey(key);
      if (!stream) {
        throw new Error(`Legacy user manifest: unknown content stream key "${key}"`);
      }
      ids.push(stream.id);
    }
    return ids;
  }
}
