import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

// Validates the X-API-KEY header against the API_KEY environment variable.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const providedKey = request.headers['x-api-key'];
    const validKey = process.env.API_KEY;

    if (!validKey) {
      throw new InternalServerErrorException('API key is not configured on the server.');
    }

    if (!providedKey || providedKey !== validKey) {
      throw new UnauthorizedException({ message: 'Invalid or missing API key.', errorCode: 'INVALID_API_KEY' });
    }

    return true;
  }
}