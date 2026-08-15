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

  async sendDigest(digest: Digest, to: string): Promise<void> {
    const from = process.env.DIGEST_FROM_EMAIL ?? 'digest@example.com';

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
    const verifyUrl = `${this.frontendUrl()}/auth/verify-email?token=${encodeURIComponent(token)}`;

    const { error } = await this.resend.emails.send({
      from,
      to,
      subject: 'Verify your email',
      html: this.renderNotificationHtml({
        eyebrow: 'Account verification',
        title: 'Confirm your email address',
        paragraphs: [
          `Hi ${displayName} — your Personal Tech Radar account was just created. Confirm this address to activate it.`,
          'Until it is confirmed, the radar will not send daily or weekly digests.',
        ],
        buttonLabel: 'Confirm my email',
        actionUrl: verifyUrl,
        fallbackLabel: 'Button not working? Paste this into your browser:',
        warning:
          "If you didn't create this account, ignore this message — nothing is activated and the address is removed from our queue automatically.",
        footerNote: 'This is a one-off account message, not a subscription.',
      }),
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
    const resetUrl = `${this.frontendUrl()}/auth/password/reset?token=${encodeURIComponent(token)}`;

    const { error } = await this.resend.emails.send({
      from,
      to,
      subject: 'Reset your password',
      html: this.renderNotificationHtml({
        eyebrow: 'Password recovery',
        title: 'Reset your password',
        paragraphs: [
          `Hi ${displayName} — a password reset was requested for your Personal Tech Radar account.`,
          'If this was you, use the button below to choose a new password. If you did not request it, you can safely ignore this message.',
        ],
        buttonLabel: 'Reset my password',
        actionUrl: resetUrl,
        fallbackLabel: 'Button not working? Paste this into your browser:',
        footerNote: 'This password-reset link is single-use and time-limited.',
      }),
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

  private renderNotificationHtml(input: {
    eyebrow: string;
    title: string;
    paragraphs: string[];
    buttonLabel: string;
    actionUrl: string;
    fallbackLabel: string;
    warning?: string;
    footerNote: string;
  }): string {
    const paragraphs = input.paragraphs
      .map(
        (paragraph) =>
          `<p style="font-size:13.5px;line-height:1.85;color:#8E8F94;margin:0 0 16px;">${escapeHtml(paragraph)}</p>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapeHtml(input.title)}</title>
  <style>
    body { margin:0; padding:0; background:#1E1F22; color:#BCBEC3; font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace; }
    a { color:#57A8F5; }
  </style>
</head>
<body style="margin:0;padding:0;background:#1E1F22;color:#BCBEC3;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;">
  <div style="background:#1E1F22;color:#BCBEC3;padding:40px 16px;box-sizing:border-box;min-height:100vh;">
    <div style="max-width:640px;margin:0 auto;">
      <div style="font-size:22px;font-weight:700;color:#BCBEC3;letter-spacing:-0.01em;margin-bottom:8px;">Personal Tech Radar<span>_</span></div>
      <div style="font-size:12px;color:#2DBBC5;margin-bottom:28px;">${escapeHtml(input.eyebrow)}</div>
      <div style="border-top:1px dashed #3A3B40;margin-bottom:36px;"></div>
      <h1 style="font-size:19px;font-weight:600;color:#BCBEC3;margin:0 0 20px;">${escapeHtml(input.title)}</h1>
      ${paragraphs}
      <p style="margin:16px 0 28px;"><a href="${escapeAttribute(input.actionUrl)}" style="display:inline-block;text-decoration:none;background:#6AAB73;color:#1E1F22;font-weight:600;font-size:13px;padding:12px 26px;border:1px solid #6AAB73;">${escapeHtml(input.buttonLabel)}</a></p>
      <div style="border:1px dashed #3A3B40;padding:16px;margin-bottom:32px;">
        <div style="font-size:11.5px;color:#8E8F94;line-height:1.9;">${escapeHtml(input.fallbackLabel)}<div style="color:#57A8F5;word-break:break-all;margin-top:6px;"><a href="${escapeAttribute(input.actionUrl)}" style="color:#57A8F5;">${escapeHtml(input.actionUrl)}</a></div></div>
      </div>
      ${input.warning ? `<p style="font-size:12px;line-height:1.85;color:#8E8F94;margin:0 0 36px;">${escapeHtml(input.warning)}</p>` : ''}
      <div style="border-top:1px dashed #3A3B40;margin-bottom:28px;"></div>
      <div style="font-size:11.5px;color:#8E8F94;text-align:center;line-height:1.8;">
        <span>${escapeHtml(input.footerNote)}</span><br>
        <span>© 2026 Personal Tech Radar</span>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  private frontendUrl(): string {
    return (process.env.FRONT_APP_URL ?? process.env.APP_URL ?? '').replace(/\/$/, '');
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
