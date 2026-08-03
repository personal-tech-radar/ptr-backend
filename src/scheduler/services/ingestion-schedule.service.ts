import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SourceCoverage } from '../../sources/entities/source-coverage.entity';
import { Source, SourceStatus } from '../../sources/entities/source.entity';
import { ContentStream } from '../../taxonomy/entities/content-stream.entity';

const STREAM_INTERVAL_HOURS: Record<string, number> = {
  security: 1,
  releases_and_changes: 3,
  industry_pulse: 2,
  engineering_experience: 12,
  expert_opinions_and_practices: 12,
};

const STREAM_PRIORITY: Record<string, number> = {
  security: 1,
  releases_and_changes: 2,
  industry_pulse: 3,
  engineering_experience: 4,
  expert_opinions_and_practices: 4,
};

export interface DueSourceJob {
  sourceId: string;
  streamIds: string[];
  priority: number;
}

@Injectable()
export class IngestionScheduleService {
  constructor(
    @InjectRepository(SourceCoverage)
    private readonly coverageRepo: Repository<SourceCoverage>,
    @InjectRepository(Source)
    private readonly sourceRepo: Repository<Source>,
    @InjectRepository(ContentStream)
    private readonly streamRepo: Repository<ContentStream>,
  ) {}

  async findDue(now = new Date()): Promise<DueSourceJob[]> {
    const coverages = await this.coverageRepo.find({
      relations: { source: true, contentStream: true },
      where: {
        source: { status: In([SourceStatus.ACTIVE, SourceStatus.DEGRADED]), enabled: true },
      },
    });
    const grouped = new Map<string, SourceCoverage[]>();
    for (const coverage of coverages) {
      grouped.set(coverage.sourceId, [...(grouped.get(coverage.sourceId) ?? []), coverage]);
    }

    const jobs: DueSourceJob[] = [];
    for (const [sourceId, sourceCoverages] of grouped) {
      const shortestHours = Math.min(
        ...sourceCoverages.map(
          (coverage) => STREAM_INTERVAL_HOURS[coverage.contentStream.key] ?? 12,
        ),
      );
      const source = sourceCoverages[0].source;
      const last = source.lastSuccessfulFetchAt ?? source.lastAttemptAt;
      if (last && now.getTime() - last.getTime() < shortestHours * 3_600_000) continue;
      jobs.push({
        sourceId,
        streamIds: sourceCoverages.map((coverage) => coverage.contentStreamId),
        priority: Math.min(
          ...sourceCoverages.map((coverage) => STREAM_PRIORITY[coverage.contentStream.key] ?? 4),
        ),
      });
    }

    // Ingest uncovered legacy sources without inventing discovery provenance.
    const uncovered = await this.sourceRepo
      .createQueryBuilder('source')
      .where('source.enabled = true')
      .andWhere('source.status IN (:...statuses)', {
        statuses: [SourceStatus.ACTIVE, SourceStatus.DEGRADED],
      })
      .andWhere('source.id NOT IN (SELECT coverage."sourceId" FROM source_coverages coverage)')
      .getMany();
    if (uncovered.length > 0) {
      const streams = await this.streamRepo.find({ where: { enabled: true } });
      for (const source of uncovered) {
        const last = source.lastSuccessfulFetchAt ?? source.lastAttemptAt;
        if (last && now.getTime() - last.getTime() < 3_600_000) continue;
        jobs.push({
          sourceId: source.id,
          streamIds: streams.map((stream) => stream.id),
          priority: 1,
        });
      }
    }
    return jobs;
  }
}
