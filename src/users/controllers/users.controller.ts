import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ErrorResponseDto } from '../../common/error/error-response.dto';
import { OnboardingDto } from '../dto/onboarding.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { UserTaxonomyResponseDto } from '../dto/user-taxonomy-response.dto';
import { toUserResponseDto, UserResponseDto } from '../dto/user-response.dto';
import { OnboardingService } from '../services/onboarding.service';
import { UserCommandService } from '../services/user-command.service';
import { UserQueryService } from '../services/user-query.service';

@ApiTags('Users')
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ErrorResponseDto })
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly userCommandService: UserCommandService,
    private readonly userQueryService: UserQueryService,
    private readonly onboardingService: OnboardingService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current authenticated user profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async me(@CurrentUser() user: CurrentUserPayload): Promise<UserResponseDto> {
    const entity = await this.userQueryService.findById(user.id);
    return toUserResponseDto(entity);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async updateMe(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const entity = await this.userCommandService.updateProfile(user.id, dto);
    return toUserResponseDto(entity);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Soft-delete the current user account' })
  @ApiResponse({ status: 200, description: 'Account deleted' })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async deleteMe(@CurrentUser() user: CurrentUserPayload): Promise<{ deleted: true }> {
    await this.userCommandService.softDelete(user.id);
    return { deleted: true };
  }

  @Post('me/onboarding')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Complete or update onboarding (level, technology interests, content streams). Safely ' +
      're-callable — also doubles as "change my selections later".',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async onboard(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: OnboardingDto,
  ): Promise<UserResponseDto> {
    const entity = await this.onboardingService.completeOnboarding(user.id, dto);
    return toUserResponseDto(entity);
  }

  @Get('me/taxonomy')
  @ApiOperation({
    summary: "Get the current user's level, technology interests, and content streams",
  })
  @ApiResponse({ status: 200, type: UserTaxonomyResponseDto })
  @ApiResponse({ status: 401, type: ErrorResponseDto })
  async myTaxonomy(@CurrentUser() user: CurrentUserPayload): Promise<UserTaxonomyResponseDto> {
    return this.onboardingService.getUserTaxonomy(user.id);
  }
}
