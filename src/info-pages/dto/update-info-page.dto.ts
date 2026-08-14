import { PartialType } from '@nestjs/swagger';
import { CreateInfoPageDto } from './create-info-page.dto';

export class UpdateInfoPageDto extends PartialType(CreateInfoPageDto) {}
