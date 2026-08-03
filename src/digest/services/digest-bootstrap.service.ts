import { Injectable } from '@nestjs/common';
import { UserQueryService } from '../../users/services/user-query.service';
import { Digest, DigestDeliveryMode, DigestType } from '../entities/digest.entity';
import { PersonalDigestBuilderService } from './personal-digest-builder.service';

@Injectable()
export class DigestBootstrapService {
  constructor(
    private readonly personalDigestBuilderService: PersonalDigestBuilderService,
    private readonly userQueryService: UserQueryService,
  ) {}

  async buildDailyDigest(userId: string, periodKey?: string): Promise<Digest> {
    const user = await this.userQueryService.findById(userId);
    return this.personalDigestBuilderService.buildForUser(user, DigestType.DAILY, periodKey);
  }

  async buildWeeklyDigest(userId: string, periodKey?: string): Promise<Digest> {
    const user = await this.userQueryService.findById(userId);
    return this.personalDigestBuilderService.buildForUser(user, DigestType.WEEKLY, periodKey);
  }

  async buildAdministratorPreview(
    userId: string,
    type: DigestType,
    administratorId: string,
    recipientEmail: string,
  ): Promise<Digest> {
    const user = await this.userQueryService.findById(userId);
    const periodKey = `admin-preview:${administratorId}:${Date.now()}`;
    return this.personalDigestBuilderService.buildForUser(user, type, periodKey, {
      mode: DigestDeliveryMode.ADMIN_PREVIEW,
      triggeringAdministratorId: administratorId,
      actualRecipientEmail: recipientEmail,
    });
  }
}
