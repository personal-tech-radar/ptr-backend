import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArticleRelevanceTable1777400000000 implements MigrationInterface {
  name = 'AddArticleRelevanceTable1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "article_relevances" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "articleId" uuid NOT NULL,
                "userId" character varying NOT NULL,
                "preAnalysisIsRelevant" boolean NOT NULL,
                "preAnalysisReason" text NOT NULL,
                "preAnalysisAt" TIMESTAMP NOT NULL,
                "fullAnalysisId" uuid,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_article_relevances" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_article_relevances_article_user" UNIQUE ("articleId", "userId")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "article_relevances"
            ADD CONSTRAINT "FK_article_relevances_article"
            FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE
        `);
    await queryRunner.query(`
            ALTER TABLE "article_relevances"
            ADD CONSTRAINT "FK_article_relevances_analysis"
            FOREIGN KEY ("fullAnalysisId") REFERENCES "article_analyses"("id") ON DELETE SET NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "article_relevances"`);
  }
}
