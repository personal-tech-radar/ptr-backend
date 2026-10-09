import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { hasVisibleInfoPageText, isSafeInfoPageMarkup } from '../utils/info-page-content.util';

@ValidatorConstraint({ name: 'safeInfoPageMarkup', async: false })
class SafeInfoPageMarkupConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isSafeInfoPageMarkup(value);
  }

  defaultMessage(): string {
    return 'text contains unsupported markup, attributes, or an unsafe link URL';
  }
}

@ValidatorConstraint({ name: 'visibleInfoPageText', async: false })
class VisibleInfoPageTextConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && hasVisibleInfoPageText(value);
  }

  defaultMessage(): string {
    return 'text must contain visible, non-empty content';
  }
}

@ValidatorConstraint({ name: 'validInfoPageBlock', async: false })
class ValidInfoPageBlockConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const block = args.object as InfoPageBlockDto;
    if (!isRecord(value) || (block.type !== 'header' && block.type !== 'paragraph')) return false;
    if (typeof value.text !== 'string') return false;
    if (!isSafeInfoPageMarkup(value.text) || !hasVisibleInfoPageText(value.text)) return false;

    if (block.type === 'header') {
      return (
        typeof value.level === 'number' &&
        Number.isInteger(value.level) &&
        value.level >= 2 &&
        value.level <= 6
      );
    }
    return value.level === undefined;
  }

  defaultMessage(): string {
    return 'each block must be a non-empty header (level 2–6) or paragraph with safe inline markup';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class InfoPageBlockDataDto {
  @ApiProperty({ description: 'Text with optional safe inline Editor.js markup.' })
  @IsString()
  @IsNotEmpty()
  @Validate(SafeInfoPageMarkupConstraint)
  @Validate(VisibleInfoPageTextConstraint)
  text: string;

  @ApiPropertyOptional({ minimum: 2, maximum: 6, description: 'Required only for header blocks.' })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(6)
  level?: number;
}

export class InfoPageBlockDto {
  @ApiPropertyOptional({ description: 'Optional stable Editor.js block identifier.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  id?: string;

  @ApiProperty({ enum: ['header', 'paragraph'] })
  @IsIn(['header', 'paragraph'])
  type: 'header' | 'paragraph';

  @ApiProperty({ type: InfoPageBlockDataDto })
  @ValidateNested()
  @Type(() => InfoPageBlockDataDto)
  @Validate(ValidInfoPageBlockConstraint)
  data: InfoPageBlockDataDto;
}

export class InfoPageDocumentDto {
  @ApiPropertyOptional({ type: Number, description: 'Optional Editor.js save timestamp in ms.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  time?: number;

  @ApiProperty({ type: [InfoPageBlockDto], minItems: 1 })
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => InfoPageBlockDto)
  blocks: InfoPageBlockDto[];

  @ApiPropertyOptional({ description: 'Optional Editor.js version string.' })
  @IsOptional()
  @IsString()
  version?: string;
}
