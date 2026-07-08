import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScoreBreakdownToDigestItems1783187844563 implements MigrationInterface {
  name = 'AddScoreBreakdownToDigestItems1783187844563';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "digest_items" ADD "scoreBreakdown" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "digest_items" DROP COLUMN "scoreBreakdown"`);
  }
}
