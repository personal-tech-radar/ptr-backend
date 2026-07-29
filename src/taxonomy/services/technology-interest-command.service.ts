import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { validate as uuidValidate } from 'uuid';
import { LoggingService } from '../../common/logging/logging.service';
import { QueueService } from '../../queue/queue.service';
import { UpdateTechnologyInterestDto } from '../dto/update-technology-interest.dto';
import { TechnologyInterest, TechnologyInterestKind } from '../entities/technology-interest.entity';
import { UserTechnologyInterest } from '../entities/user-technology-interest.entity';
import { normalizeTechnologyInterestName } from '../util/normalize-technology-interest-name.util';
import { TechnologyInterestResolverService } from './technology-interest-resolver.service';

@Injectable()
export class TechnologyInterestCommandService {
  private readonly logger = new LoggingService(TechnologyInterestCommandService.name);

  constructor(
    @InjectRepository(TechnologyInterest)
    private readonly technologyInterestRepo: Repository<TechnologyInterest>,
    @InjectRepository(UserTechnologyInterest)
    private readonly userTechnologyInterestRepo: Repository<UserTechnologyInterest>,
    private readonly resolverService: TechnologyInterestResolverService,
    private readonly queueService: QueueService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // Resolves/creates the technology-interest row (see TechnologyInterestResolverService), links
  // it to the calling user (upsert — ignores an existing link, never errors), and — only when a
  // genuinely new row was created — enqueues a stub discovery job on the isolated
  // taxonomy-source-discovery queue.
  async createOrReuse(
    userId: string,
    kind: TechnologyInterestKind,
    name: string,
  ): Promise<TechnologyInterest> {
    const { entity, created } = await this.resolverService.resolve(kind, name);

    const existingLink = await this.userTechnologyInterestRepo.findOne({
      where: { userId, technologyInterestId: entity.id },
    });
    if (!existingLink) {
      await this.userTechnologyInterestRepo.save(
        this.userTechnologyInterestRepo.create({ userId, technologyInterestId: entity.id }),
      );
    }

    if (created) {
      await this.queueService.addTaxonomySourceDiscoveryJob(entity.id);
    }

    this.logger.info('Technology/interest resolved and linked to user', {
      userId,
      technologyInterestId: entity.id,
      created,
    });

    return entity;
  }

  // Reassigns every UserTechnologyInterest row from loser -> winner, deleting instead of
  // reassigning when a user already has both selected (unique-constraint collision), then
  // soft-deletes the loser with mergedIntoId set. Wrapped in a single transaction (mirrors
  // SourcesService.create/SourceCandidatesService.promote) so a mid-way failure leaves neither
  // row touched.
  async merge(winnerId: string, loserId: string): Promise<TechnologyInterest> {
    if (!uuidValidate(winnerId) || !uuidValidate(loserId)) {
      throw new BadRequestException('winnerId and loserId must be valid UUIDs');
    }
    if (winnerId === loserId) {
      throw new BadRequestException('winnerId and loserId must be different');
    }

    return this.dataSource.transaction(async (manager) => {
      const winner = await manager.findOne(TechnologyInterest, { where: { id: winnerId } });
      if (!winner) {
        throw new NotFoundException(`Technology/interest ${winnerId} not found`);
      }

      const loser = await manager.findOne(TechnologyInterest, { where: { id: loserId } });
      if (!loser) {
        throw new NotFoundException(`Technology/interest ${loserId} not found`);
      }

      const loserLinks = await manager.find(UserTechnologyInterest, {
        where: { technologyInterestId: loserId },
      });

      // Checked ahead of time, deliberately not via a try/catch around the update-then-collide
      // path: Postgres aborts the entire transaction on any statement error, so a caught
      // unique-violation here would leave every later statement in this transaction (including
      // the delete-instead-of-reassign fallback itself, and the loser's own soft-delete below)
      // failing with "current transaction is aborted" unless run through a savepoint. Checking
      // for the collision first avoids ever triggering that error in the first place.
      for (const link of loserLinks) {
        const winnerAlreadyLinked = await manager.findOne(UserTechnologyInterest, {
          where: { userId: link.userId, technologyInterestId: winnerId },
        });

        if (winnerAlreadyLinked) {
          await manager.delete(UserTechnologyInterest, { id: link.id });
        } else {
          await manager.update(
            UserTechnologyInterest,
            { id: link.id },
            { technologyInterestId: winnerId },
          );
        }
      }

      // Fold the loser's normalizedName (and any aliases it had itself accumulated from prior
      // similarity-match resolutions) into the winner's aliases before soft-deleting it. Without
      // this, the loser's normalizedName still occupies its slot in the (kind, normalizedName)
      // unique constraint after soft-delete, but TechnologyInterestResolverService.resolve()'s
      // exact/alias/similarity tiers all exclude soft-deleted rows — so a later resolve() call for
      // that exact name would fall through to `create` and hit an uncaught unique-violation.
      const mergedAliases = new Set(winner.aliases ?? []);
      mergedAliases.add(loser.normalizedName);
      for (const alias of loser.aliases ?? []) {
        mergedAliases.add(alias);
      }
      winner.aliases = Array.from(mergedAliases);
      await manager.save(TechnologyInterest, winner);

      loser.mergedIntoId = winnerId;
      loser.deletedAt = new Date();
      await manager.save(TechnologyInterest, loser);

      this.logger.info('Technology/interest merged', {
        winnerId,
        loserId,
        reassignedLinks: loserLinks.length,
      });

      return winner;
    });
  }

  // Edits name/aliases only — `kind` is immutable (see UpdateTechnologyInterestDto) and there is
  // no dedicated delete endpoint (merge is the only supported consolidation path). A name change
  // is checked for a (kind, normalizedName) collision via `.withDeleted()`: that DB constraint is
  // NOT a partial index (confirmed in the CreateTaxonomyTables migration), so a soft-deleted row
  // still occupies its slot and would otherwise raise an uncaught unique-violation on save.
  async update(id: string, dto: UpdateTechnologyInterestDto): Promise<TechnologyInterest> {
    if (!uuidValidate(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const entity = await this.technologyInterestRepo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Technology/interest ${id} not found`);
    }

    if (dto.name !== undefined) {
      const normalized = normalizeTechnologyInterestName(dto.name);
      if (normalized !== entity.normalizedName) {
        const collision = await this.technologyInterestRepo
          .createQueryBuilder('ti')
          .withDeleted()
          .where('ti.kind = :kind', { kind: entity.kind })
          .andWhere('ti.normalizedName = :n', { n: normalized })
          .andWhere('ti.id != :id', { id })
          .getOne();

        if (collision) {
          throw new ConflictException(
            `Another technology/interest already uses the name "${dto.name}" — use merge instead of renaming into a duplicate`,
          );
        }
      }
      entity.name = dto.name;
      entity.normalizedName = normalized;
    }

    if (dto.aliases !== undefined) {
      const normalizedAliases = new Set(
        dto.aliases
          .map((alias) => normalizeTechnologyInterestName(alias))
          .filter((alias) => alias.length > 0),
      );
      entity.aliases = Array.from(normalizedAliases);
    }

    const saved = await this.technologyInterestRepo.save(entity);
    this.logger.info('Technology/interest updated', { id: saved.id });
    return saved;
  }
}
