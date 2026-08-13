import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

function statusToCode(status: number): string {
  const map: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
  };
  return map[status] ?? 'UNKNOWN_ERROR';
}

export function redactSensitiveQueryValues(url: string): string {
  const [path, query] = url.split('?', 2);
  if (!query) return path;

  const params = new URLSearchParams(query);
  for (const key of ['token', 'refreshToken', 'accessToken', 'apiKey']) {
    if (params.has(key)) params.set(key, '[REDACTED]');
  }
  return `${path}?${params.toString()}`;
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const safePath = redactSensitiveQueryValues(request.url);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorCode: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else {
        const details = res as { message?: string | string[]; errorCode?: string };
        message = details.message ?? message;
        errorCode = details.errorCode ?? statusToCode(status);
      }
      if (Number(status) >= 500) {
        this.logger.error(`${request.method} ${safePath} → ${status}`, (exception as Error).stack);
      }
    } else if (isHttpErrorWithStatus(exception)) {
      const externalStatus = exception.status;
      status = externalStatus;
      message = externalStatus === 413 ? 'Request payload is too large' : message;
      errorCode = statusToCode(externalStatus);
      if (externalStatus >= 500) {
        this.logger.error(
          `${request.method} ${safePath} → ${status}`,
          exception instanceof Error ? exception.stack : JSON.stringify(exception),
        );
      }
    } else {
      this.logger.error(
        `Unhandled exception on ${request.method} ${safePath}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      path: safePath,
      message,
      ...(errorCode !== undefined && { errorCode }),
    });
  }
}

function isHttpErrorWithStatus(exception: unknown): exception is { status: number } {
  if (typeof exception !== 'object' || exception === null) return false;
  const status = (exception as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 600;
}
