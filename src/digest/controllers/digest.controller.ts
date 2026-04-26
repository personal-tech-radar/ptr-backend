import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { MailService } from '../../mail/services/mail.service';
import { Digest } from '../entities/digest.entity';
import { DigestType } from '../entities/digest.entity';
import { ResendDigestResponseDto, TriggerDigestDto } from '../dto/digest-response.dto';
import { DigestBootstrapService } from '../services/digest-bootstrap.service';
import { DigestQueryService } from '../services/digest-query.service';

@ApiTags('Digests')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('digests')
export class DigestController {
  constructor(
    private readonly digestBootstrapService: DigestBootstrapService,
    private readonly digestQueryService: DigestQueryService,
    private readonly mailService: MailService,
  ) {}

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fetch, analyze, build, and send a digest of the selected type' })
  @ApiResponse({ status: 200, type: ResendDigestResponseDto })
  @ApiResponse({ status: 404, description: 'No digest available to send' })
  async triggerDigest(@Body() dto: TriggerDigestDto): Promise<ResendDigestResponseDto> {
    const built = await this.build(dto.type);
    const digest = built ?? await this.digestQueryService.findLatestBuiltOrSent();
    await this.mailService.sendDigest(digest);
    await this.digestQueryService.markSent(digest.id);
    return {
      success: true,
      digestId: digest.id,
      subject: digest.subject,
      message: built ? `Fresh ${dto.type} digest built and sent` : 'No new articles — latest digest resent',
    };
  }

  private async build(type: DigestType): Promise<Digest | null> {
    switch (type) {
      case DigestType.DAILY:
        return this.digestBootstrapService.buildDailyDigest();
      case DigestType.WEEKLY:
        return this.digestBootstrapService.buildWeeklyDigest();
      case DigestType.DEEP_DIVE_WEEKLY:
        return this.digestBootstrapService.buildDeepDiveWeeklyDigest();
    }
  }
}
