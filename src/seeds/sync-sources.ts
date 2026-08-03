import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { loadManifest, SourceSyncService } from '../sources/services/source-sync.service';

dotenv.config();

// Bootstraps the *real* application graph (identical to main.ts) rather than a hand-picked
// subset of modules, so SourceSyncService and everything it delegates to (SourcesService,
// SourceDiscoveryService, SourceCandidatesService, and — for 'web'/'auto' manifest entries —
// SourceStructureAiService) resolve exactly as they do in the running server, with no risk of a
// half-assembled module graph silently missing a provider. The extra modules this pulls in
// (SchedulerModule, MailModule, QueueModule, ...) are inert for the few seconds this script runs;
// `app.close()` in the `finally` block tears everything down before the process exits.
async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const { filePath, format, entries } = loadManifest();
  console.log(
    `Loaded ${entries.length} manifest entries from ${filePath} (${format} format)` +
      `${force ? ' — --force: operational fields (enabled/trustScore) will be overwritten' : ''}`,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const sourceSyncService = app.get(SourceSyncService);
    const summary = await sourceSyncService.syncAll(entries, { force });

    console.log(
      `Sync complete: ${summary.created.length} created, ${summary.updated.length} updated, ` +
        `${summary.candidatesCreated.length} candidate(s) created/refreshed, ` +
        `${summary.failed.length} failed`,
    );
    if (summary.created.length > 0) console.log(`Created: ${summary.created.join(', ')}`);
    if (summary.candidatesCreated.length > 0) {
      console.log(`Candidates queued: ${summary.candidatesCreated.join(', ')}`);
    }
    if (summary.failed.length > 0) {
      console.log(`Failed: ${summary.failed.map((f) => `${f.seedKey} (${f.reason})`).join('; ')}`);
    }
  } finally {
    await app.close();
  }
}

// Guards direct invocation (`ts-node src/seeds/sync-sources.ts`) so the exported `loadManifest`/
// `SourceSyncService` can be imported by tests without triggering a full app bootstrap.
if (require.main === module) {
  main().catch((err) => {
    console.error('Source manifest sync failed:', err);
    process.exit(1);
  });
}
