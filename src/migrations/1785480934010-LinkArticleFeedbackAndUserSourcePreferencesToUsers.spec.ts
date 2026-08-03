import { QueryRunner } from 'typeorm';
import { LinkArticleFeedbackAndUserSourcePreferencesToUsers1785480934010 } from './1785480934010-LinkArticleFeedbackAndUserSourcePreferencesToUsers';

describe('LinkArticleFeedbackAndUserSourcePreferencesToUsers migration', () => {
  it('retags the legacy sentinel before converting the columns', async () => {
    const queries: string[] = [];
    const query = jest.fn((sql: string) => {
      queries.push(sql);
      if (sql.includes('SELECT EXISTS')) return [{ exists: true }];
      if (sql.includes('SELECT "id" FROM "users"')) return [];
      if (sql.includes('INSERT INTO "users"')) return [{ id: 'legacy-user-id' }];
      return [];
    });

    await new LinkArticleFeedbackAndUserSourcePreferencesToUsers1785480934010().up({
      query,
    } as unknown as QueryRunner);

    const preferenceRetag = queries.findIndex((sql) =>
      sql.includes('UPDATE "user_source_preferences"'),
    );
    const feedbackRetag = queries.findIndex((sql) => sql.includes('UPDATE "article_feedbacks"'));
    const preferenceCast = queries.findIndex((sql) =>
      sql.includes('ALTER TABLE "user_source_preferences"'),
    );
    expect(preferenceRetag).toBeGreaterThan(0);
    expect(feedbackRetag).toBeGreaterThan(preferenceRetag);
    expect(preferenceCast).toBeGreaterThan(feedbackRetag);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO "users"'));
  });

  it('does not create a placeholder when no legacy sentinel exists', async () => {
    const query = jest.fn((sql: string) => {
      if (sql.includes('SELECT EXISTS')) return [{ exists: false }];
      return [];
    });

    await new LinkArticleFeedbackAndUserSourcePreferencesToUsers1785480934010().up({
      query,
    } as unknown as QueryRunner);

    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO "users"'));
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE "user_source_preferences"'),
    );
  });
});
