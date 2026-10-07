import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { DashboardOverviewResponseDto } from '../dto/dashboard-overview-response.dto';
import { AdministratorAuthGuard } from '../../administrators/guards/administrator-auth.guard';
import { DashboardOverviewQueryDto } from '../dto/dashboard-overview-query.dto';
import { AdminDashboardService } from '../services/admin-dashboard.service';

@ApiTags('Admin - Dashboard')
@ApiBearerAuth('administrator-bearer')
@UseGuards(AdministratorAuthGuard)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('overview')
  @ApiOkResponse({ type: DashboardOverviewResponseDto })
  @ApiOperation({ summary: 'Return dashboard-ready administration aggregates' })
  overview(@Query() query: DashboardOverviewQueryDto) {
    return this.dashboard.overview(query.period);
  }
}
