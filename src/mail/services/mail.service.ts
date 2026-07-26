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

  // Auth emails reuse DIGEST_FROM_EMAIL as the sender — this repo has no dedicated
  // general-purpose "from" address env var yet, and adding one is out of scope for this phase.
  async sendVerificationEmail(to: string, displayName: string, token: string): Promise<void> {
    const from = process.env.DIGEST_FROM_EMAIL ?? 'digest@example.com';
    const verifyUrl = `${process.env.APP_URL ?? ''}/auth/verify-email?token=${encodeURIComponent(token)}`;

    const { error } = await this.resend.emails.send({
      from,
      to,
      subject: 'Verify your email',
      html: `<p>Hi ${displayName},</p><p>Welcome! Please verify your email address by clicking the link below:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
      text: `Hi ${displayName},\n\nWelcome! Please verify your email address by visiting:\n${verifyUrl}`,
    });

    if (error) {
      this.logger.error('Resend API error sending verification email', new Error(error.message), {
        to,
      });
      throw new Error(`Failed to send verification email: ${error.message}`);
    }

    this.logger.info('Verification email sent', { to });
  }

  async sendPasswordResetEmail(to: string, displayName: string, token: string): Promise<void> {
    const from = process.env.DIGEST_FROM_EMAIL ?? 'digest@example.com';
    const resetUrl = `${process.env.APP_URL ?? ''}/auth/password/reset?token=${encodeURIComponent(token)}`;

    const { error } = await this.resend.emails.send({
      from,
      to,
      subject: 'Reset your password',
      html: `<p>Hi ${displayName},</p><p>A password reset was requested for your account. If this was you, click the link below to choose a new password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
      text: `Hi ${displayName},\n\nA password reset was requested for your account. If this was you, visit:\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    });

    if (error) {
      this.logger.error('Resend API error sending password reset email', new Error(error.message), {
        to,
      });
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }

    this.logger.info('Password reset email sent', { to });
  }
}
