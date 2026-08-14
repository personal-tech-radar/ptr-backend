import { MigrationInterface, QueryRunner } from 'typeorm';

type SeedPage = { title: string; key: string; heading: string; paragraphs: string[] };

const PAGES: SeedPage[] = [
  {
    title: 'Legal Notice',
    key: 'legal-notice-default',
    heading: 'Legal Notice',
    paragraphs: [
      'Personal Tech Radar is provided as an information service for software professionals.',
      'Content is supplied by third-party sources and is provided for general information only. Please verify important technical, legal, and security decisions against authoritative sources.',
      'For questions about this service, contact the service operator through the support address configured for your deployment.',
    ],
  },
  {
    title: 'Privacy Policy',
    key: 'privacy-policy-default',
    heading: 'Privacy Policy',
    paragraphs: [
      'Personal Tech Radar stores account details, profile selections, saved articles, feedback, and delivery preferences needed to provide personalized feeds and digests.',
      'The service uses this information to authenticate users, personalize content, deliver requested emails, and maintain operational security. It does not sell personal information.',
      'Configure the contact and retention details for your deployment before publishing this page as a final legal policy.',
    ],
  },
  {
    title: 'Cookies Policy',
    key: 'cookies-policy-default',
    heading: 'Cookies Policy',
    paragraphs: [
      'Personal Tech Radar may use strictly necessary cookies or equivalent browser storage for authentication and secure user interactions.',
      'Operational caching and security controls may also store short-lived technical identifiers. These controls are used to provide the requested service and are not used for third-party advertising.',
      'Review this example with your deployment requirements and add any jurisdiction-specific details before publication.',
    ],
  },
];

function documentFor(page: SeedPage): string {
  return JSON.stringify({
    systemKey: page.key,
    version: 1,
    blocks: [
      { type: 'heading', data: { level: 1, text: page.heading } },
      ...page.paragraphs.map((text) => ({ type: 'paragraph', data: { text } })),
    ],
  });
}

export class SeedDefaultInfoPages1786002000000 implements MigrationInterface {
  name = 'SeedDefaultInfoPages1786002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const page of PAGES) {
      await queryRunner.query(
        `INSERT INTO "info_pages" ("title", "fullText", "isActive")
         SELECT $1, $2, true
         WHERE NOT EXISTS (
           SELECT 1 FROM "info_pages"
           WHERE "title" = $1 AND "deletedAt" IS NULL
         )`,
        [page.title, documentFor(page)],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const page of PAGES) {
      const marker = `%"systemKey":"${page.key}"%`;
      await queryRunner.query(
        `DELETE FROM "info_pages"
         WHERE "title" = $1 AND "fullText" LIKE $2`,
        [page.title, marker],
      );
    }
  }
}
