import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SaveFromEmailQueryDto {
  @ApiProperty({
    description: 'ID of the user the save-from-email link was generated for',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  // Intentionally not @IsUUID(): a malformed value must reach the handler so it can render the
  // same HTML error page as an invalid signature, instead of the global ValidationPipe's raw
  // JSON 400 — see SaveFromEmailController's class-level contract note.
  @IsString()
  userId: string;

  @ApiProperty({
    description: 'HMAC-SHA256 signature proving this link was issued by the server',
    example: 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3b0c1d2e3f4a5b6c7d8e9f01',
  })
  @IsString()
  signature: string;
}
