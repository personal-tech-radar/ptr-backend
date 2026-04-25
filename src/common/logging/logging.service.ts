import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LoggingService {
  private readonly logger: Logger;

  constructor(context: string = 'App') {
    this.logger = new Logger(context);
  }

  info(message: string, meta?: any) {
    this.logger.log(meta ? `${message} ${JSON.stringify(meta)}` : message);
  }

  error(message: string, error?: any, meta?: any) {
    const base = meta ? `${message} ${JSON.stringify(meta)}` : message;
    this.logger.error(base, error?.stack);
  }

  warn(message: string, meta?: any) {
    this.logger.warn(meta ? `${message} ${JSON.stringify(meta)}` : message);
  }

  debug(message: string, meta?: any) {
    this.logger.debug(meta ? `${message} ${JSON.stringify(meta)}` : message);
  }
}