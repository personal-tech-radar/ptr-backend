import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import { LoggingService } from '../../common/logging/logging.service';
import { Digest } from '../../digest/entities/digest.entity';

@Injectable()
export class MailService {
  private readonly logger = new LoggingService(MailService.name);
  private readonly resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendDigest(digest: Digest): Promise<void> {
    const from = process.env.DIGEST_FROM_EMAIL ?? 'digest@example.com';
    const to = process.env.DIGEST_TO_EMAIL ?? '';

    if (!to) {
      this.logger.warn('DIGEST_TO_EMAIL is not set, skipping send');
      return;
    }

    const { error } = await this.resend.emails.send({
      from,
      to,
      subject: digest.subject,
      html: digest.htmlBody,
      text: digest.textBody,
    });

    if (error) {
      this.logger.error('Resend API error', new Error(error.message), {
        digestId: digest.id,
      });
      throw new Error(`Failed to send email: ${error.message}`);
    }

    this.logger.info('Digest email sent', {
      digestId: digest.id,
      subject: digest.subject,
    });
  }
}
