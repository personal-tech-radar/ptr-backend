import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { LoggingService } from '../../common/logging/logging.service';
import { UpdateContentStreamDto } from '../dto/update-content-stream.dto';
import { ContentStream } from '../entities/content-stream.entity';
import { UserContentStream } from '../entities/user-content-stream.entity';

// Deliberately small: linking was the only write operation content streams needed until this
// phase added admin editing (the streams themselves remain a fixed, curated set — never
// created/deleted — see ContentStreamQueryService). Exists mainly so OnboardingService can link
// selections without reaching into TaxonomyModule's repositories directly (see coder.md's
// module-boundary rule).
@Injectable()
export class ContentStreamCommandService {
  private readonly logger = new LoggingService(ContentStreamCommandService.name);

  constructor(
    @InjectRepository(ContentStream)
    private readonly contentStreamRepo: Repository<ContentStream>,
    @InjectRepository(UserContentStream)
    private readonly userContentStreamRepo: Repository<UserContentStream>,
  ) {}

  // Upsert-ignore: an already-linked stream is left untouched, never errors. Safe to call
  // repeatedly with the same selection (onboarding is re-callable).
  async linkUserSelections(userId: string, contentStreamIds: string[]): Promise<void> {
    for (const contentStreamId of contentStreamIds) {
      const existing = await this.userContentStreamRepo.findOne({
        where: { userId, contentStreamId },
      });
      if (existing) continue;

      await this.userContentStreamRepo.save(
        this.userContentStreamRepo.create({ userId, contentStreamId }),
      );
    }

    this.logger.info('User content stream selections linked', {
      userId,
      count: contentStreamIds.length,
    });
  }

  // Edits name/description/sortOrder/enabled only — `key` is immutable (see
  // UpdateContentStreamDto) and there is no delete endpoint at all (content streams are a fixed,
  // never-deleted set — see ContentStream entity).
  async update(id: string, dto: UpdateContentStreamDto): Promise<ContentStream> {
    if (!uuidValidate(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const entity = await this.contentStreamRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Content stream ${id} not found`);
    }

    if (dto.name !== undefined) {
      entity.name = dto.name;
    }

    if (dto.description !== undefined) {
      entity.description = dto.description;
    }

    if (dto.sortOrder !== undefined) {
      entity.sortOrder = dto.sortOrder;
    }

    if (dto.enabled !== undefined) {
      entity.enabled = dto.enabled;
    }

    const saved = await this.contentStreamRepo.save(entity);
    this.logger.info('Content stream updated', { id: saved.id });
    return saved;
  }
}
