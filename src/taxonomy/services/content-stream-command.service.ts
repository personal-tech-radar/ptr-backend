import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { LoggingService } from '../../common/logging/logging.service';
import { UpdateContentStreamDto } from '../dto/update-content-stream.dto';
import { ContentStream } from '../entities/content-stream.entity';
import { UserContentStream } from '../entities/user-content-stream.entity';

// Own stream selection synchronization and fixed-catalog administration.
@Injectable()
export class ContentStreamCommandService {
  private readonly logger = new LoggingService(ContentStreamCommandService.name);

  constructor(
    @InjectRepository(ContentStream)
    private readonly contentStreamRepo: Repository<ContentStream>,
    @InjectRepository(UserContentStream)
    private readonly userContentStreamRepo: Repository<UserContentStream>,
  ) {}

  // Synchronizes the complete selection set in one transaction. The unique database constraint
  // prevents duplicates, while the existence check keeps identical requests idempotent.
  async linkUserSelections(userId: string, contentStreamIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(contentStreamIds)];

    await this.userContentStreamRepo.manager.transaction(async (manager) => {
      await manager.delete(UserContentStream, {
        userId,
        contentStreamId: Not(In(uniqueIds)),
      });

      const existing = await manager.find(UserContentStream, {
        where: { userId, contentStreamId: In(uniqueIds) },
      });
      const existingIds = new Set(existing.map((link) => link.contentStreamId));
      const missing = uniqueIds
        .filter((contentStreamId) => !existingIds.has(contentStreamId))
        .map((contentStreamId) => manager.create(UserContentStream, { userId, contentStreamId }));

      if (missing.length > 0) {
        await manager.save(UserContentStream, missing);
      }
    });

    this.logger.info('User content stream selections synchronized', {
      userId,
      count: uniqueIds.length,
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
