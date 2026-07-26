import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggingService } from '../../common/logging/logging.service';
import { UserContentStream } from '../entities/user-content-stream.entity';

// Deliberately small and separate from ContentStreamQueryService: linking is the only write
// operation content streams need in this phase (the streams themselves are a fixed, curated set
// — see ContentStreamQueryService), so a full command/query pair for the join table alone would
// be overkill. Exists mainly so OnboardingService can link selections without reaching into
// TaxonomyModule's repositories directly (see coder.md's module-boundary rule).
@Injectable()
export class ContentStreamCommandService {
  private readonly logger = new LoggingService(ContentStreamCommandService.name);

  constructor(
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
}
