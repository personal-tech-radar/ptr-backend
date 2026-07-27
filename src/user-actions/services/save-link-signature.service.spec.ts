import { SaveLinkSignatureService } from './save-link-signature.service';

const userId = '123e4567-e89b-12d3-a456-426614174000';
const articleId = '223e4567-e89b-12d3-a456-426614174000';
const otherUserId = '323e4567-e89b-12d3-a456-426614174000';
const otherArticleId = '423e4567-e89b-12d3-a456-426614174000';

describe('SaveLinkSignatureService', () => {
  let service: SaveLinkSignatureService;
  const originalSecret = process.env.SAVE_LINK_SECRET;

  beforeEach(() => {
    process.env.SAVE_LINK_SECRET = 'test-save-link-secret';
    service = new SaveLinkSignatureService();
  });

  afterEach(() => {
    process.env.SAVE_LINK_SECRET = originalSecret;
  });

  describe('sign/verify', () => {
    it('verifies a signature produced by sign() for the same userId/articleId', () => {
      const signature = service.sign(userId, articleId);
      expect(service.verify(userId, articleId, signature)).toBe(true);
    });

    it('fails verification when the userId is tampered with', () => {
      const signature = service.sign(userId, articleId);
      expect(service.verify(otherUserId, articleId, signature)).toBe(false);
    });

    it('fails verification when the articleId is tampered with', () => {
      const signature = service.sign(userId, articleId);
      expect(service.verify(userId, otherArticleId, signature)).toBe(false);
    });

    it('fails verification when the signature itself is tampered with', () => {
      const signature = service.sign(userId, articleId);
      const tampered = signature.slice(0, -2) + (signature.slice(-2) === '00' ? '11' : '00');
      expect(service.verify(userId, articleId, tampered)).toBe(false);
    });

    it('returns false for a garbage/wrong-length signature instead of throwing', () => {
      expect(() => service.verify(userId, articleId, 'not-a-real-signature')).not.toThrow();
      expect(service.verify(userId, articleId, 'not-a-real-signature')).toBe(false);
    });

    it('returns false for an empty signature instead of throwing', () => {
      expect(() => service.verify(userId, articleId, '')).not.toThrow();
      expect(service.verify(userId, articleId, '')).toBe(false);
    });
  });

  describe('getSaveLinkSecret fail-fast', () => {
    it('throws when SAVE_LINK_SECRET is not configured', () => {
      delete process.env.SAVE_LINK_SECRET;
      expect(() => service.sign(userId, articleId)).toThrow(
        'SAVE_LINK_SECRET environment variable is not configured.',
      );
    });
  });

  describe('buildSaveFromEmailUrl', () => {
    it('builds a URL containing the userId and a valid signature', () => {
      process.env.APP_URL = 'https://app.example.com';
      const url = service.buildSaveFromEmailUrl(userId, articleId);

      expect(url).toContain(`https://app.example.com/articles/${articleId}/save-from-email`);
      expect(url).toContain(`userId=${userId}`);

      const signatureParam = new URL(url).searchParams.get('signature');
      expect(signatureParam).not.toBeNull();
      expect(service.verify(userId, articleId, signatureParam as string)).toBe(true);
    });
  });
});
