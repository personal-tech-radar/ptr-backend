import { MigrationInterface, QueryRunner } from 'typeorm';

// The raw CLI-generated diff also included the same unrelated `article_relevances`
// constraint-naming drift stripped out of `CreateUsersAuth` (pre-existing on `main`, caused by
// `AddArticleRelevanceTable`'s hand-picked constraint names not matching TypeORM's default
// hash-based naming) — stripped again here since it's unrelated to the taxonomy schema this
// migration introduces.
//
// The `CREATE EXTENSION`/GIN trigram index/content_streams seed INSERT statements below are not
// something `migration:generate`'s entity diff can produce on its own (no entity field maps to a
// Postgres extension, an index operator class, or a hand-picked list of seed rows) — they are
// genuinely additive, hand-added content per this phase's spec, not an edit to anything the CLI
// generated.
export class CreateTaxonomyTables1785061726436 implements MigrationInterface {
  name = 'CreateTaxonomyTables1785061726436';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."technology_interests_kind_enum" AS ENUM('technology', 'interest')`,
    );
    await queryRunner.query(
      `CREATE TABLE "technology_interests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "kind" "public"."technology_interests_kind_enum" NOT NULL, "name" character varying NOT NULL, "normalizedName" character varying NOT NULL, "aliases" jsonb NOT NULL DEFAULT '[]', "mergedIntoId" uuid, "deletedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_d05fbcf4a7d8f66d3baedf36ca5" UNIQUE ("kind", "normalizedName"), CONSTRAINT "PK_8a09ed8c79520e8b33622a4ca3f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_technology_interests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "technologyInterestId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_31a9299b4b13340ddd97221e48e" UNIQUE ("userId", "technologyInterestId"), CONSTRAINT "PK_e353ebbcacbe1d6027932df92f5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "content_streams" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying NOT NULL, "name" character varying NOT NULL, "description" character varying, "sortOrder" integer NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_60c125572b2cc55744c002fb9c9" UNIQUE ("key"), CONSTRAINT "PK_d3a4f281cce03fe222db9ccf1d6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_content_streams" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "contentStreamId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_aa4b200716ef703cba102be6d61" UNIQUE ("userId", "contentStreamId"), CONSTRAINT "PK_bb15bb2320ac3f9ea28b0222a64" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."taxonomy_source_discovery_requests_status_enum" AS ENUM('pending_manual_review')`,
    );
    await queryRunner.query(
      `CREATE TABLE "taxonomy_source_discovery_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "technologyInterestId" uuid NOT NULL, "requestedAt" TIMESTAMP NOT NULL DEFAULT now(), "status" "public"."taxonomy_source_discovery_requests_status_enum" NOT NULL DEFAULT 'pending_manual_review', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7270bc6465987bb458b4ab05b08" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_technology_interests" ADD CONSTRAINT "FK_43ec34e466609214eba5ebb12c4" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_technology_interests" ADD CONSTRAINT "FK_1a296717c86d8823176fed38ad8" FOREIGN KEY ("technologyInterestId") REFERENCES "technology_interests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_content_streams" ADD CONSTRAINT "FK_131c699ff4810de48c5f22e4dba" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_content_streams" ADD CONSTRAINT "FK_7f0c5ded11a71dddf67ea92084c" FOREIGN KEY ("contentStreamId") REFERENCES "content_streams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" ADD CONSTRAINT "FK_386b75646112b8f3ca5b667dbd6" FOREIGN KEY ("technologyInterestId") REFERENCES "technology_interests"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    // Required for TechnologyInterestResolverService's similarity() calls (pg_trgm's trigram
    // similarity function) — the resolver's third-tier dedup match, gated by
    // TAXONOMY_SIMILARITY_THRESHOLD.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(
      `CREATE INDEX "IDX_technology_interests_normalizedName_trgm" ON "technology_interests" USING gin ("normalizedName" gin_trgm_ops)`,
    );

    // Fixed, curated set of 5 content streams (see CLAUDE.md/coder.md spec) — never seeded
    // implicitly at bootstrap, and not managed via the sources-manifest sync pattern either,
    // since this is a one-time fixed list rather than an operator-curated, growable reference set.
    await queryRunner.query(`
      INSERT INTO "content_streams" ("key", "name", "sortOrder") VALUES
        ('releases_and_changes', 'Releases and changes', 0),
        ('security', 'Security', 1),
        ('industry_pulse', 'Industry pulse', 2),
        ('engineering_experience', 'Engineering experience', 3),
        ('expert_opinions_and_practices', 'Expert opinions and practices', 4)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "content_streams" WHERE "key" IN (
      'releases_and_changes', 'security', 'industry_pulse', 'engineering_experience', 'expert_opinions_and_practices'
    )`);
    await queryRunner.query(`DROP INDEX "public"."IDX_technology_interests_normalizedName_trgm"`);
    // Deliberately not dropping the pg_trgm extension: it's a database-wide, shared resource that
    // other migrations/features could depend on independently of this one table's index.

    await queryRunner.query(
      `ALTER TABLE "taxonomy_source_discovery_requests" DROP CONSTRAINT "FK_386b75646112b8f3ca5b667dbd6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_content_streams" DROP CONSTRAINT "FK_7f0c5ded11a71dddf67ea92084c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_content_streams" DROP CONSTRAINT "FK_131c699ff4810de48c5f22e4dba"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_technology_interests" DROP CONSTRAINT "FK_1a296717c86d8823176fed38ad8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_technology_interests" DROP CONSTRAINT "FK_43ec34e466609214eba5ebb12c4"`,
    );
    await queryRunner.query(`DROP TABLE "taxonomy_source_discovery_requests"`);
    await queryRunner.query(`DROP TYPE "public"."taxonomy_source_discovery_requests_status_enum"`);
    await queryRunner.query(`DROP TABLE "user_content_streams"`);
    await queryRunner.query(`DROP TABLE "content_streams"`);
    await queryRunner.query(`DROP TABLE "user_technology_interests"`);
    await queryRunner.query(`DROP TABLE "technology_interests"`);
    await queryRunner.query(`DROP TYPE "public"."technology_interests_kind_enum"`);
  }
}
