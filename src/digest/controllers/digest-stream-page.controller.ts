import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DigestStreamPageService } from '../services/digest-stream-page.service';

@ApiTags('Email Actions')
@Controller('digest-stream')
export class DigestStreamPageController {
  constructor(private readonly pageService: DigestStreamPageService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Open a digest stream page using its permanent opaque link',
    description:
      'Public backend-rendered page scoped to one user, digest period, and stream. The opaque UUID grants access without a JWT while keeping user profile data private. Article links use tracked redirects, and Save, Useful, and Not useful actions use permanent idempotent links.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Permanent opaque digest-stream page UUID' })
  @ApiProduces('text/html')
  @ApiResponse({ status: 200, description: 'Backend-rendered digest stream HTML page' })
  @Header('Content-Type', 'text/html')
  render(@Param('id') id: string): Promise<string> {
    return this.pageService.render(id);
  }
}
