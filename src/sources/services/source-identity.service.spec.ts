import { SourceIdentityService } from './source-identity.service';

describe('SourceIdentityService', () => {
  const repository = { createQueryBuilder: jest.fn() };
  const dataSource = { transaction: jest.fn() };
  const service = new SourceIdentityService(repository as never, dataSource as never);

  it('deduplicates equivalent GitHub repository URLs', () => {
    expect(
      service.isEquivalent(
        service.resolve('https://github.com/OpenAI/Example.git'),
        service.resolve('https://github.com/openai/example'),
      ),
    ).toBe(true);
  });

  it('does not collapse unrelated paths on the same platform', () => {
    expect(
      service.isEquivalent(
        service.resolve('https://medium.com/team-a'),
        service.resolve('https://medium.com/team-b'),
      ),
    ).toBe(false);
  });

  it('serializes overlapping creators and makes both resolve to one source', async () => {
    let stored: { id: string; url: string } | null = null;
    let transactionTail = Promise.resolve();
    const manager = {
      query: jest.fn(),
      createQueryBuilder: jest.fn(() => {
        const qb = {
          withDeleted: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          orWhere: jest.fn().mockReturnThis(),
          getMany: jest.fn(() => Promise.resolve(stored ? [stored] : [])),
        };
        return qb;
      }),
    };
    dataSource.transaction.mockImplementation(
      (work: (value: typeof manager) => Promise<unknown>) => {
        const result = transactionTail.then(() => work(manager));
        transactionTail = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    );
    const create = jest.fn((_manager, normalizedUrl: string) => {
      stored = { id: 'one-source', url: normalizedUrl };
      return Promise.resolve(stored);
    });

    const [left, right] = await Promise.all([
      service.resolveOrCreate('https://example.com/feed/', create as never),
      service.resolveOrCreate('https://example.com/feed', create as never),
    ]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(left.source.id).toBe('one-source');
    expect(right.source.id).toBe('one-source');
    expect([left.created, right.created].sort()).toEqual([false, true]);
    expect(manager.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', [
      'https://example.com/feed',
    ]);
  });
});
