import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateSourceDto } from './create-source.dto';

// webConfig is intentionally excluded: SourcesService.update() persists only Source
// columns, so accepting it here would silently swallow client-submitted config
// instead of applying it. Web source config changes go through the dedicated
// updateWebSourceConfigRecipe() path.
// type is intentionally excluded: it's immutable after creation. Allowing it to change
// (e.g. rss -> web) would either leave a `web` Source with no WebSourceConfig, or orphan
// an existing WebSourceConfig for a source converted away from `web`.
export class UpdateSourceDto extends PartialType(
  OmitType(CreateSourceDto, ['webConfig', 'type'] as const),
) {}
