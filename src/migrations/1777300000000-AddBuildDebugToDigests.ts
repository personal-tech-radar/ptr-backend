import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBuildDebugToDigests1777300000000 implements MigrationInterface {
  name = 'AddBuildDebugToDigests1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "digests" ADD "buildDebug" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "digests" DROP COLUMN "buildDebug"`);
  }
}
