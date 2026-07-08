import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateWebSourceConfigs1783237541754 implements MigrationInterface {
    name = 'CreateWebSourceConfigs1783237541754'

    // NOTE: the raw CLI diff also emitted DROP/ADD lines for `article_relevances`
    // FK/UNIQUE constraints (renaming hand-written constraint names to TypeORM's
    // auto-generated hash names). That table is untouched by this migration and
    // is not part of this change, so those lines were stripped. This is expected
    // drift from 1777400000000-AddArticleRelevanceTable.ts using friendly
    // constraint names instead of TypeORM's naming convention.
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."web_source_configs_preferreddiscoverymethod_enum" AS ENUM('rss', 'atom', 'sitemap', 'cheerio', 'playwright')`);
        await queryRunner.query(`CREATE TYPE "public"."web_source_configs_preferredextractionmethod_enum" AS ENUM('readability', 'cheerio_selector', 'playwright')`);
        await queryRunner.query(`CREATE TABLE "web_source_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sourceId" uuid NOT NULL, "entryUrls" jsonb, "sitemapUrl" character varying, "preferredDiscoveryMethod" "public"."web_source_configs_preferreddiscoverymethod_enum", "preferredExtractionMethod" "public"."web_source_configs_preferredextractionmethod_enum", "articleLinkSelector" character varying, "articleContentSelector" character varying, "nextPageSelector" character varying, "allowedPathPatterns" jsonb, "excludedPathPatterns" jsonb, "lastValidatedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c69de40360a697ee02b17d51355" UNIQUE ("sourceId"), CONSTRAINT "REL_c69de40360a697ee02b17d5135" UNIQUE ("sourceId"), CONSTRAINT "PK_1bc74228e237db172b295201f65" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TYPE "public"."sources_type_enum" RENAME TO "sources_type_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."sources_type_enum" AS ENUM('rss', 'atom', 'github_release', 'web')`);
        await queryRunner.query(`ALTER TABLE "sources" ALTER COLUMN "type" TYPE "public"."sources_type_enum" USING "type"::"text"::"public"."sources_type_enum"`);
        await queryRunner.query(`DROP TYPE "public"."sources_type_enum_old"`);
        await queryRunner.query(`ALTER TABLE "web_source_configs" ADD CONSTRAINT "FK_c69de40360a697ee02b17d51355" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "web_source_configs" DROP CONSTRAINT "FK_c69de40360a697ee02b17d51355"`);
        await queryRunner.query(`CREATE TYPE "public"."sources_type_enum_old" AS ENUM('rss', 'atom', 'github_release')`);
        await queryRunner.query(`ALTER TABLE "sources" ALTER COLUMN "type" TYPE "public"."sources_type_enum_old" USING "type"::"text"::"public"."sources_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."sources_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."sources_type_enum_old" RENAME TO "sources_type_enum"`);
        await queryRunner.query(`DROP TABLE "web_source_configs"`);
        await queryRunner.query(`DROP TYPE "public"."web_source_configs_preferredextractionmethod_enum"`);
        await queryRunner.query(`DROP TYPE "public"."web_source_configs_preferreddiscoverymethod_enum"`);
    }

}
