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
import { DiscoveryOperationType } from '../../sources/entities/discovery-quota-record.entity';
import { DiscoveryQuotaService } from '../../sources/services/discovery-quota.service';
import { QueueService } from '../../queue/services/queue.service';
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
    private readonly discoveryQuotaService: DiscoveryQuotaService,
    private readonly queueService: QueueService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // Resolve the catalog row, link it to the user, and discover sources only for new rows.
  async createOrReuse(
    userId: string,
    kind: TechnologyInterestKind,
    name: string,
  ): Promise<TechnologyInterest> {
    const { entity, created } = await this.resolverService.resolve(
      kind,
      name,
      async (normalized) => {
        await this.discoveryQuotaService.reserve(
          userId,
          kind === TechnologyInterestKind.TECHNOLOGY
            ? DiscoveryOperationType.TECHNOLOGY
            : DiscoveryOperationType.INTEREST,
          `${kind}:${normalized}`,
        );
      },
    );

    const existingLink = await this.userTechnologyInterestRepo.findOne({
      where: { userId, technologyInterestId: entity.id },
    });
    if (!existingLink) {
      await this.userTechnologyInterestRepo.save(
        this.userTechnologyInterestRepo.create({ userId, technologyInterestId: entity.id }),
      );
    }

    if (created) {
      await this.queueService.addTaxonomySourceDiscoveryJob(entity.id, userId);
    }

    this.logger.info('Technology/interest resolved and linked to user', {
      userId,
      technologyInterestId: entity.id,
      created,
    });

    return entity;
  }

  async removeUnselected(userId: string, selectedIds: string[]): Promise<void> {
    const qb = this.userTechnologyInterestRepo
      .createQueryBuilder()
      .delete()
      .where('"userId" = :userId', { userId });
    if (selectedIds.length > 0) {
      qb.andWhere('"technologyInterestId" NOT IN (:...selectedIds)', { selectedIds });
    }
    await qb.execute();
  }

  // Merge user links transactionally, then soft-delete the losing catalog row.
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

      // Check collisions before updating to keep the transaction usable.
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

      // Preserve the losing identity as an alias before soft deletion.
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

  // Update names and aliases; kind is immutable and merge is the only consolidation path.
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
