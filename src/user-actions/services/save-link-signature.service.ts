import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { getSaveLinkSecret } from '../utils/save-link-secret.util';

const SIGNATURE_VERSION = 'save-article:v1';
const SAVE_FROM_EMAIL_PATH_SEGMENT = 'save-from-email';

@Injectable()
export class SaveLinkSignatureService {
  sign(userId: string, articleId: string): string {
    return createHmac('sha256', getSaveLinkSecret())
      .update(`${SIGNATURE_VERSION}:${userId}:${articleId}`)
      .digest('hex');
  }

  // Guards the length check before timingSafeEqual, which throws (rather than returning false)
  // when given mismatched-length buffers — a malformed/truncated signature must fail closed, not
  // crash the request.
  verify(userId: string, articleId: string, signature: string): boolean {
    const expected = this.sign(userId, articleId);

    if (Buffer.byteLength(expected) !== Buffer.byteLength(signature)) {
      return false;
    }

    const expectedBuffer = Buffer.from(expected, 'hex');
    const providedBuffer = Buffer.from(signature, 'hex');

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, providedBuffer);
  }

  // Unconsumed in this phase — no caller wires this into a real feed/digest email template yet.
  // Shipped as groundwork for Phase 6/10, matching how Phase 4's ScoringModule shipped unwired.
  buildSaveFromEmailUrl(userId: string, articleId: string): string {
    const signature = this.sign(userId, articleId);
    const appUrl = process.env.APP_URL ?? '';
    const query = `userId=${encodeURIComponent(userId)}&signature=${encodeURIComponent(signature)}`;
    return `${appUrl}/articles/${articleId}/${SAVE_FROM_EMAIL_PATH_SEGMENT}?${query}`;
  }
}
