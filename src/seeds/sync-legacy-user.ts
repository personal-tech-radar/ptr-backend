import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import {
  LegacyUserSyncService,
  loadLegacyUserManifest,
} from '../users/services/legacy-user-sync.service';

dotenv.config();

// Bootstraps the *real* application graph (identical to main.ts), matching sync-sources.ts's
// pattern, so LegacyUserSyncService and everything it delegates to (UserCommandService,
// OnboardingService, ContentStreamQueryService, ArticleFeedbackService/UserSourcePreferenceService
// for the legacy-row retag) resolve exactly as they do in the running server.
// `app.close()` in the `finally` block tears everything down before the process exits.
async function main(): Promise<void> {
  const entry = loadLegacyUserManifest();
  console.log(`Loaded legacy user manifest entry for ${entry.email}`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const legacyUserSyncService = app.get(LegacyUserSyncService);
    const summary = await legacyUserSyncService.sync(entry);

    console.log(
      `Legacy user sync complete: ${summary.created ? 'created' : 'updated'} user ${summary.userId} ` +
        `(${summary.email}). Retagged ${summary.retaggedArticleFeedbackCount} article_feedbacks ` +
        `row(s) and ${summary.retaggedUserSourcePreferenceCount} user_source_preferences row(s).`,
    );
  } finally {
    await app.close();
  }
}

// Guards direct invocation (`ts-node src/seeds/sync-legacy-user.ts`) so `loadLegacyUserManifest`/
// `LegacyUserSyncService` can be imported by tests without triggering a full app bootstrap.
if (require.main === module) {
  main().catch((err) => {
    console.error('Legacy user sync failed:', err);
    process.exit(1);
  });
}
