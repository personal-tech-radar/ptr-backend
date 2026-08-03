import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CurrentAdministrator } from '../interfaces/current-administrator.interface';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentAdministrator =>
    context.switchToHttp().getRequest<{ user: CurrentAdministrator }>().user,
);
