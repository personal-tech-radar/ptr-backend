import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

interface SourceManifestEntry {
  name: string;
  seedUrl: string;
  sourceType?: string;
  category: string;
  trustScore: number;
  enabled: boolean;
  discovery: { mode: string; entryUrls?: string[]; allowedPathPatterns?: string[] };
}

interface BootstrapManifests {
  sources: { sources: SourceManifestEntry[] };
  legacy: {
    user: {
      email: string;
      timezone: string;
      level: string;
      githubUrl: string | null;
      dailyDigestEnabled: boolean;
      weeklyDigestEnabled: boolean;
      contentStreamKeys: string[];
      technologyInterests: { kind: string; name: string }[];
    };
  };
}

const SOURCE_MANIFEST_SHA256 = '9ef570d761fe94e0abb6cd17dc6ddc24ad602e18114b10bbcd80e13fa18bc0d3';
const USER_MANIFEST_SHA256 = '762db3a4041cc53ea31dfc1ede60138dc74b2593463fd5e5840b3c15636ec530';
const DISABLED_PASSWORD_SENTINEL = '!password-setup-required!';

export class BootstrapLegacyProductCatalog1785945600000 implements MigrationInterface {
  name = 'BootstrapLegacyProductCatalog1785945600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const manifests = this.loadPinnedManifests();
    const user = manifests.legacy.user;
    const email = user.email.trim().toLowerCase();

    const [existingUser] = (await queryRunner.query(
      `SELECT "id" FROM "users" WHERE lower("email") = $1 LIMIT 1`,
      [email],
    )) as { id: string }[];
    if (!existingUser) {
      await queryRunner.query(
        `INSERT INTO "users" (
        "email", "passwordHash", "displayName", "timezone", "githubUrl", "level",
        "dailyDigestEnabled", "weeklyDigestEnabled", "emailVerifiedAt", "onboardingCompletedAt"
        ) VALUES ($1, $2, 'Miter Sidorov', $3, $4, $5, $6, $7, now(), now())`,
        [
          email,
          DISABLED_PASSWORD_SENTINEL,
          user.timezone,
          user.githubUrl,
          user.level,
          user.dailyDigestEnabled,
          user.weeklyDigestEnabled,
        ],
      );
    }

    const [{ id: userId }] = (await queryRunner.query(
      `SELECT "id" FROM "users" WHERE lower("email") = $1`,
      [email],
    )) as { id: string }[];

    for (const selection of user.technologyInterests) {
      const normalizedName = selection.name.trim().toLowerCase().replace(/\s+/g, ' ');
      await queryRunner.query(
        `INSERT INTO "technology_interests" ("kind", "name", "normalizedName", "aliases")
         VALUES ($1, $2, $3, '[]'::jsonb)
         ON CONFLICT ("kind", "normalizedName") DO NOTHING`,
        [selection.kind, selection.name, normalizedName],
      );
      await queryRunner.query(
        `INSERT INTO "user_technology_interests" ("userId", "technologyInterestId")
         SELECT $1, ti."id" FROM "technology_interests" ti
         WHERE ti."kind" = $2 AND ti."normalizedName" = $3
         ON CONFLICT ("userId", "technologyInterestId") DO NOTHING`,
        [userId, selection.kind, normalizedName],
      );
    }

    for (const key of user.contentStreamKeys) {
      await queryRunner.query(
        `INSERT INTO "user_content_streams" ("userId", "contentStreamId")
         SELECT $1, cs."id" FROM "content_streams" cs WHERE cs."key" = $2
         ON CONFLICT ("userId", "contentStreamId") DO NOTHING`,
        [userId, key],
      );
    }

    for (const source of manifests.sources.sources) {
      const type = source.sourceType ?? (source.discovery.mode === 'rss' ? 'rss' : 'web');
      const status = source.enabled ? 'active' : 'disabled';
      const canonicalUrl = this.normalizeSourceUrl(source.seedUrl);
      let [resolvedSource] = (await queryRunner.query(
        `SELECT "id" FROM "sources"
         WHERE "canonicalUrl" = $1 OR "url" = $2 OR rtrim("url", '/') = rtrim($2, '/')
         LIMIT 1`,
        [canonicalUrl, source.seedUrl],
      )) as { id: string }[];
      if (!resolvedSource) {
        await queryRunner.query(
          `INSERT INTO "sources" (
          "name", "url", "canonicalUrl", "feedUrl", "type", "category", "enabled", "status", "trustScore"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT ("url") DO NOTHING`,
          [
            source.name,
            source.seedUrl,
            canonicalUrl,
            source.discovery.mode === 'rss' ? source.seedUrl : null,
            type,
            source.category,
            source.enabled,
            status,
            source.trustScore,
          ],
        );
        [resolvedSource] = (await queryRunner.query(
          `SELECT "id" FROM "sources" WHERE "url" = $1 LIMIT 1`,
          [source.seedUrl],
        )) as { id: string }[];
      }
      await queryRunner.query(
        `INSERT INTO "web_source_configs" (
          "sourceId", "entryUrls", "preferredDiscoveryMethod", "allowedPathPatterns"
        ) VALUES ($1, $2::jsonb, $3, $4::jsonb)
        ON CONFLICT ("sourceId") DO NOTHING`,
        [
          resolvedSource.id,
          JSON.stringify(source.discovery.entryUrls ?? [source.seedUrl]),
          source.discovery.mode === 'rss' ? 'rss' : null,
          JSON.stringify(source.discovery.allowedPathPatterns ?? []),
        ],
      );
    }
  }

  public async down(): Promise<void> {
    // Bootstrap rows are shared business data; rollback is intentionally conservative.
  }

  private loadPinnedManifests(): BootstrapManifests {
    const sourcePath = join(process.cwd(), 'config', 'sources.manifest.json');
    const userPath = join(process.cwd(), 'config', 'legacy-user.manifest.json');
    const sourceRaw = readFileSync(sourcePath, 'utf8');
    const userRaw = readFileSync(userPath, 'utf8');
    this.assertChecksum(sourceRaw, SOURCE_MANIFEST_SHA256, sourcePath);
    this.assertChecksum(userRaw, USER_MANIFEST_SHA256, userPath);
    return {
      sources: JSON.parse(sourceRaw) as BootstrapManifests['sources'],
      legacy: JSON.parse(userRaw) as BootstrapManifests['legacy'],
    };
  }

  private assertChecksum(content: string, expected: string, path: string): void {
    const actual = createHash('sha256').update(content).digest('hex');
    if (actual !== expected) {
      throw new Error(`Bootstrap manifest ${path} changed after migration publication`);
    }
  }

  private normalizeSourceUrl(value: string): string {
    const url = new URL(value);
    url.hash = '';
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  }
}
