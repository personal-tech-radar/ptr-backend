import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { SubmitSourceDto, SourceSubmissionResponseDto } from '../dto/submit-source.dto';
import { SourceSubmissionService } from '../services/source-submission.service';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('source-discovery')
export class UserSourceSubmissionController {
  constructor(private readonly sourceSubmissionService: SourceSubmissionService) {}

  @Post('sources')
  @ApiOperation({
    summary: 'Submit a source URL for shared validation and onboarding',
    description:
      'Reserves the authenticated user discovery quota only for genuinely new work, resolves known source or rejected-candidate state, and otherwise creates a candidate for the unified onboarding coordinator. The response distinguishes accepted, active, degraded, disabled, already rejected, invalid, and rejected outcomes.',
  })
  @ApiResponse({ status: 201, type: SourceSubmissionResponseDto })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Rolling discovery quota exhausted (DISCOVERY_LIMIT_REACHED)',
  })
  submit(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SubmitSourceDto,
  ): Promise<SourceSubmissionResponseDto> {
    return this.sourceSubmissionService.submit(user.id, dto.url);
  }
}
