import { Injectable, Logger } from '@nestjs/common';

export function sanitizeLogText(value: string): string {
  return value
    .replace(/(Incorrect API key provided:)\s*[^.\r\n]+/gi, '$1 [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_.*-]+/g, '[REDACTED_API_KEY]')
    .replace(/(api[-_ ]?key["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[REDACTED]');
}

@Injectable()
export class LoggingService {
  private readonly logger: Logger;

  constructor(context: string = 'App') {
    this.logger = new Logger(context);
  }

  info(message: string, meta?: any) {
    this.logger.log(meta ? `${message} ${JSON.stringify(meta)}` : message);
  }

  error(message: string, error?: unknown, meta?: any) {
    const base = meta ? `${message} ${JSON.stringify(meta)}` : message;
    const stackValue =
      typeof error === 'object' && error !== null && 'stack' in error
        ? (error as { stack?: unknown }).stack
        : undefined;
    const stack = typeof stackValue === 'string' ? sanitizeLogText(stackValue) : undefined;
    this.logger.error(sanitizeLogText(base), stack);
  }

  warn(message: string, meta?: any) {
    this.logger.warn(meta ? `${message} ${JSON.stringify(meta)}` : message);
  }

  debug(message: string, meta?: any) {
    this.logger.debug(meta ? `${message} ${JSON.stringify(meta)}` : message);
  }
}
