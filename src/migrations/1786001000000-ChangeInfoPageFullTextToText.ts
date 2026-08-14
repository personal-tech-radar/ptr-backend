import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeInfoPageFullTextToText1786001000000 implements MigrationInterface {
  name = 'ChangeInfoPageFullTextToText1786001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "info_pages" ALTER COLUMN "fullText" TYPE text USING "fullText"::text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "info_pages" ALTER COLUMN "fullText" TYPE jsonb USING "fullText"::jsonb`,
    );
  }
}
