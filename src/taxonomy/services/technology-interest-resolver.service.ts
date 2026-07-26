import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { TechnologyInterest, TechnologyInterestKind } from '../entities/technology-interest.entity';
import { normalizeTechnologyInterestName } from '../util/normalize-technology-interest-name.util';

// Threshold read once at module load, same pattern as PLAYWRIGHT_QUEUE_CONCURRENCY
// (src/queue/queue.service.ts) — a per-feature constant living alongside the logic it tunes.
export const TAXONOMY_SIMILARITY_THRESHOLD = parseFloat(
  process.env.TAXONOMY_SIMILARITY_THRESHOLD || '0.6',
);

export interface ResolveResult {
  entity: TechnologyInterest;
  created: boolean;
}

// Pure normalization/dedup pipeline: exact match -> alias match -> pg_trgm similarity match ->
// create. No user-linking, no queue side effects — those are orchestrated by
// TechnologyInterestCommandService.createOrReuse, which calls resolve() and then links/enqueues.
@Injectable()
export class TechnologyInterestResolverService {
  private readonly logger = new LoggingService(TechnologyInterestResolverService.name);

  constructor(
    @InjectRepository(TechnologyInterest)
    private readonly technologyInterestRepo: Repository<TechnologyInterest>,
  ) {}

  async resolve(kind: TechnologyInterestKind, rawName: string): Promise<ResolveResult> {
    const normalized = normalizeTechnologyInterestName(rawName);

    const exactMatch = await this.technologyInterestRepo.findOne({
      where: { kind, normalizedName: normalized },
    });
    if (exactMatch) {
      return { entity: exactMatch, created: false };
    }

    const aliasMatch = await this.technologyInterestRepo
      .createQueryBuilder('ti')
      .where('ti.kind = :kind', { kind })
      .andWhere('ti.deletedAt IS NULL')
      .andWhere('ti.aliases @> :alias::jsonb', { alias: JSON.stringify([normalized]) })
      .getOne();
    if (aliasMatch) {
      return { entity: aliasMatch, created: false };
    }

    const similarityMatch = await this.technologyInterestRepo
      .createQueryBuilder('ti')
      .where('ti.kind = :kind', { kind })
      .andWhere('ti.deletedAt IS NULL')
      .andWhere('similarity(ti.normalizedName, :normalized) > :threshold', {
        normalized,
        threshold: TAXONOMY_SIMILARITY_THRESHOLD,
      })
      .orderBy('similarity(ti.normalizedName, :normalized)', 'DESC')
      .getOne();

    if (similarityMatch) {
      if (!similarityMatch.aliases.includes(normalized)) {
        similarityMatch.aliases = [...similarityMatch.aliases, normalized];
        await this.technologyInterestRepo.save(similarityMatch);
        this.logger.info('Alias appended to similarity-matched technology/interest', {
          id: similarityMatch.id,
          alias: normalized,
        });
      }
      return { entity: similarityMatch, created: false };
    }

    const created = this.technologyInterestRepo.create({
      kind,
      name: rawName.trim(),
      normalizedName: normalized,
      aliases: [],
      mergedIntoId: null,
    });
    const saved = await this.technologyInterestRepo.save(created);
    this.logger.info('New technology/interest created', {
      id: saved.id,
      kind,
      normalizedName: normalized,
    });
    return { entity: saved, created: true };
  }

  // Read-only lookup for the analysis pipeline (AiAnalysisService): exact + alias tiers only, no
  // similarity search, no create-on-miss. An article's analysis output must never grow the
  // taxonomy catalog — that stays exclusively resolve()'s job, called only from onboarding.
  async resolveExisting(
    kind: TechnologyInterestKind,
    rawName: string,
  ): Promise<TechnologyInterest | null> {
    const normalized = normalizeTechnologyInterestName(rawName);

    const exactMatch = await this.technologyInterestRepo.findOne({
      where: { kind, normalizedName: normalized },
    });
    if (exactMatch) {
      return exactMatch;
    }

    const aliasMatch = await this.technologyInterestRepo
      .createQueryBuilder('ti')
      .where('ti.kind = :kind', { kind })
      .andWhere('ti.deletedAt IS NULL')
      .andWhere('ti.aliases @> :alias::jsonb', { alias: JSON.stringify([normalized]) })
      .getOne();

    return aliasMatch ?? null;
  }
}
