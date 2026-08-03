import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TechnologyInterest } from '../../taxonomy/entities/technology-interest.entity';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { QuerySourceCoverageDto } from '../dto/query-source-coverage.dto';

export interface SourceCoverageRow {
  technologyInterestId: string;
  name: string;
  kind: string;
  streamId: string;
  streamKey: string;
  activeSources: number;
  degradedSources: number;
  disabledSources: number;
}

@Injectable()
export class SourceCoverageQueryService {
  constructor(
    @InjectRepository(TechnologyInterest)
    private readonly taxonomyRepo: Repository<TechnologyInterest>,
  ) {}

  async findAll(query: QuerySourceCoverageDto): Promise<PaginatedResponseDto<SourceCoverageRow>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.taxonomyRepo
      .createQueryBuilder('taxonomy')
      .innerJoin(
        'content_streams',
        'stream',
        `(taxonomy.kind = 'technology' OR stream.key NOT IN ('releases_and_changes', 'security'))`,
      )
      .leftJoin(
        'source_coverages',
        'coverage',
        'coverage."technologyInterestId" = taxonomy.id AND coverage."contentStreamId" = stream.id',
      )
      .leftJoin(
        'sources',
        'source',
        'source.id = coverage."sourceId" AND source."deletedAt" IS NULL',
      )
      .where('taxonomy."deletedAt" IS NULL')
      .andWhere('stream.enabled = true')
      .select('taxonomy.id', 'technologyInterestId')
      .addSelect('taxonomy.name', 'name')
      .addSelect('taxonomy.kind', 'kind')
      .addSelect('stream.id', 'streamId')
      .addSelect('stream.key', 'streamKey')
      .addSelect(`COUNT(source.id) FILTER (WHERE source.status = 'active')`, 'activeSources')
      .addSelect(`COUNT(source.id) FILTER (WHERE source.status = 'degraded')`, 'degradedSources')
      .addSelect(`COUNT(source.id) FILTER (WHERE source.status = 'disabled')`, 'disabledSources')
      .groupBy('taxonomy.id')
      .addGroupBy('stream.id');

    if (query.technologyInterestId)
      qb.andWhere('taxonomy.id = :taxonomyId', { taxonomyId: query.technologyInterestId });
    if (query.streamId) qb.andWhere('stream.id = :streamId', { streamId: query.streamId });
    if (query.kind) qb.andWhere('taxonomy.kind = :kind', { kind: query.kind });
    if (query.sourceStatus) {
      qb.andWhere('(source.status = :sourceStatus OR source.id IS NULL)', {
        sourceStatus: query.sourceStatus,
      });
    }
    if (query.zeroActiveCoverage)
      qb.having(`COUNT(source.id) FILTER (WHERE source.status = 'active') = 0`);
    if (query.minActiveSources !== undefined) {
      qb.andHaving(`COUNT(source.id) FILTER (WHERE source.status = 'active') >= :minimum`, {
        minimum: query.minActiveSources,
      });
    }

    const all = await qb
      .orderBy('taxonomy.name', 'ASC')
      .addOrderBy('stream.sortOrder', 'ASC')
      .getRawMany();
    const total = all.length;
    const data = all.slice((page - 1) * limit, page * limit).map((row) => ({
      ...row,
      activeSources: Number(row.activeSources),
      degradedSources: Number(row.degradedSources),
      disabledSources: Number(row.disabledSources),
    })) as SourceCoverageRow[];
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
