import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArticleFeedbackTable1780918636191 implements MigrationInterface {
  name = 'AddArticleFeedbackTable1780918636191';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."article_feedbacks_type_enum" AS ENUM('useful', 'not_useful')`,
    );
    await queryRunner.query(
      `CREATE TABLE "article_feedbacks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "articleId" uuid NOT NULL, "userId" character varying NOT NULL, "type" "public"."article_feedbacks_type_enum" NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_8faa113346fe4c1fa90f3107c01" UNIQUE ("articleId", "userId"), CONSTRAINT "PK_d7c899eed5cea3947fb961a7423" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "article_feedbacks" ADD CONSTRAINT "FK_f4fe51ff1df0a56356c5a502c05" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "article_feedbacks" DROP CONSTRAINT "FK_f4fe51ff1df0a56356c5a502c05"`,
    );
    await queryRunner.query(`DROP TABLE "article_feedbacks"`);
    await queryRunner.query(`DROP TYPE "public"."article_feedbacks_type_enum"`);
  }
}
