import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { normalizeUrl } from '../../common/util/url-normalize.util';
import { Source } from '../entities/source.entity';

export interface ResolvedSourceIdentity {
  normalizedUrl: string;
  domain: string;
  meaningfulPath: string;
  repositoryOwner: string | null;
  repositoryName: string | null;
}

export interface SourceIdentityResolution {
  source: Source;
  created: boolean;
}

@Injectable()
export class SourceIdentityService {
  constructor(
    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  resolve(url: string): ResolvedSourceIdentity {
    const normalizedUrl = normalizeUrl(url);
    const parsed = new URL(normalizedUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const isGithub = parsed.hostname.toLowerCase() === 'github.com' && segments.length >= 2;
    return {
      normalizedUrl,
      domain: parsed.hostname.toLowerCase().replace(/^www\./, ''),
      meaningfulPath: `/${segments.join('/')}`,
      repositoryOwner: isGithub ? segments[0].toLowerCase() : null,
      repositoryName: isGithub ? segments[1].replace(/\.git$/i, '').toLowerCase() : null,
    };
  }

  async findEquivalent(url: string): Promise<Source | null> {
    return this.findEquivalentWith(this.sourceRepo, url);
  }

  async resolveOrCreate(
    url: string,
    create: (manager: EntityManager, normalizedUrl: string) => Promise<Source>,
  ): Promise<SourceIdentityResolution> {
    const identity = this.resolve(url);
    return this.dataSource.transaction(async (manager) => {
      // Serialize only creators of the same canonical identity. The unique constraint remains
      // the final invariant; the advisory lock makes the expected race a normal reuse outcome.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [identity.normalizedUrl]);
      const existing = await this.findEquivalentWith(manager, identity.normalizedUrl);
      if (existing) return { source: existing, created: false };
      const source = await create(manager, identity.normalizedUrl);
      return { source, created: true };
    });
  }

  private async findEquivalentWith(
    repository: Pick<Repository<Source>, 'createQueryBuilder'> | EntityManager,
    url: string,
  ): Promise<Source | null> {
    const identity = this.resolve(url);
    const qb =
      repository instanceof EntityManager
        ? repository.createQueryBuilder(Source, 'source')
        : repository.createQueryBuilder('source');
    const candidates = await qb
      .withDeleted()
      .where('source.url = :url', { url: identity.normalizedUrl })
      .orWhere('source.canonicalUrl = :url', { url: identity.normalizedUrl })
      .orWhere('source.feedUrl = :url', { url: identity.normalizedUrl })
      .orWhere(
        identity.repositoryOwner && identity.repositoryName
          ? '(LOWER(source.repositoryOwner) = :owner AND LOWER(source.repositoryName) = :repo)'
          : 'FALSE',
        { owner: identity.repositoryOwner, repo: identity.repositoryName },
      )
      .getMany();

    for (const source of candidates) {
      if (
        this.isEquivalent(
          identity,
          this.resolve(source.canonicalUrl ?? source.feedUrl ?? source.url),
        )
      ) {
        return source;
      }
    }
    return null;
  }

  isEquivalent(left: ResolvedSourceIdentity, right: ResolvedSourceIdentity): boolean {
    if (left.normalizedUrl === right.normalizedUrl) return true;
    if (
      left.repositoryOwner &&
      right.repositoryOwner &&
      left.repositoryOwner === right.repositoryOwner &&
      left.repositoryName === right.repositoryName
    ) {
      return true;
    }
    // Sharing a domain is deliberately insufficient: paths must identify the same section.
    return (
      left.domain === right.domain &&
      left.meaningfulPath !== '/' &&
      left.meaningfulPath === right.meaningfulPath
    );
  }
}
