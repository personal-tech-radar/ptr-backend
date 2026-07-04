import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserSourcePreferences1783187790526 implements MigrationInterface {
  name = 'CreateUserSourcePreferences1783187790526';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_source_preferences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" character varying NOT NULL, "sourceId" uuid NOT NULL, "usefulCount" integer NOT NULL DEFAULT '0', "notUsefulCount" integer NOT NULL DEFAULT '0', "feedbackAdjustment" numeric(4,2) NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_3b02d144dae3b65f98f5dd8d701" UNIQUE ("userId", "sourceId"), CONSTRAINT "PK_c698f8d14779ac9b8d48b0d62f0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_source_preferences" ADD CONSTRAINT "FK_fd9602f3c293dcf01d2e2699515" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_source_preferences" DROP CONSTRAINT "FK_fd9602f3c293dcf01d2e2699515"`,
    );
    await queryRunner.query(`DROP TABLE "user_source_preferences"`);
  }
}
