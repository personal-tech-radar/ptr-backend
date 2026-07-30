import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { HybridAuthGuard } from '../../auth/guards/hybrid-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { UserRole } from '../../users/entities/user.entity';
import { UserQueryService } from '../../users/services/user-query.service';
import { MailService } from '../../mail/services/mail.service';
import { Digest, DigestType } from '../entities/digest.entity';
import { ResendDigestResponseDto, TriggerDigestDto } from '../dto/digest-response.dto';
import { DigestBootstrapService } from '../services/digest-bootstrap.service';
import { DigestQueryService } from '../services/digest-query.service';

@ApiTags('Digests')
@ApiBearerAuth()
@ApiSecurity('api-key')
@UseGuards(HybridAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('digests')
export class DigestController {
  constructor(
    private readonly digestBootstrapService: DigestBootstrapService,
    private readonly digestQueryService: DigestQueryService,
    private readonly userQueryService: UserQueryService,
    private readonly mailService: MailService,
  ) {}

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Fetch, analyze, build, and send a single-recipient personal digest of the selected type',
  })
  @ApiResponse({ status: 200, type: ResendDigestResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  @ApiResponse({
    status: 403,
    type: ErrorResponseDto,
    description: 'User exists but has not verified their email — cannot receive any digest',
  })
  @ApiResponse({
    status: 404,
    type: ErrorResponseDto,
    description: 'User not found, or no digest available to send (no eligible candidates)',
  })
  async triggerDigest(@Body() dto: TriggerDigestDto): Promise<ResendDigestResponseDto> {
    // findById excludes soft-deleted users by default (TypeORM @DeleteDateColumn behavior), so
    // deletedAt IS NULL is already implicitly enforced here. emailVerifiedAt is the one gate from
    // the sweep's eligibility check (UserQueryService.findEligibleForDigestSweep) that must also
    // hold for this manual/admin trigger — a user must have verified their email to receive ANY
    // digest (MVP3 Phase 10, decision #5). Onboarding/opt-in toggles are sweep-only automation
    // gates and are deliberately not enforced here.
    const user = await this.userQueryService.findById(dto.userId);
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        message: 'User has not verified their email — cannot send digest',
        errorCode: 'EMAIL_NOT_VERIFIED',
      });
    }

    const digest = await this.build(dto.type, dto.userId);

    if (!digest) {
      throw new NotFoundException('No digest available to send — no eligible candidates found');
    }

    await this.mailService.sendDigest(digest, user.email);
    await this.digestQueryService.markSent(digest.id);

    return {
      success: true,
      digestId: digest.id,
      subject: digest.subject,
      message: `Fresh ${dto.type} digest built and sent`,
    };
  }

  private async build(type: DigestType, userId: string): Promise<Digest | null> {
    return type === DigestType.DAILY
      ? this.digestBootstrapService.buildDailyDigest(userId)
      : this.digestBootstrapService.buildWeeklyDigest(userId);
  }
}
