import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowPreVerificationOnboarding1785772800000 implements MigrationInterface {
  name = 'AllowPreVerificationOnboarding1785772800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "timezone" DROP NOT NULL`);
    await queryRunner.query(`
      INSERT INTO "technology_interests" ("kind", "name", "normalizedName", "aliases") VALUES
        ('interest', 'System design', 'system design', '[]'::jsonb),
        ('interest', 'Software architecture', 'software architecture', '[]'::jsonb),
        ('interest', 'Observability', 'observability', '[]'::jsonb),
        ('interest', 'Distributed systems', 'distributed systems', '[]'::jsonb),
        ('interest', 'AI engineering', 'ai engineering', '[]'::jsonb)
      ON CONFLICT ("kind", "normalizedName") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "technology_interests"
      WHERE "kind" = 'interest'
        AND "normalizedName" IN (
          'system design', 'software architecture', 'observability', 'distributed systems',
          'ai engineering'
        )
        AND NOT EXISTS (
          SELECT 1 FROM "user_technology_interests" uti
          WHERE uti."technologyInterestId" = "technology_interests"."id"
        )
    `);
    await queryRunner.query(`UPDATE "users" SET "timezone" = 'UTC' WHERE "timezone" IS NULL`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "timezone" SET NOT NULL`);
  }
}
