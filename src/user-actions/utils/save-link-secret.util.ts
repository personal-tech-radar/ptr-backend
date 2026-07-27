// Single source of truth for the HMAC secret used to sign/verify save-from-email links
// (SaveLinkSignatureService). Mirrors src/auth/utils/jwt-secret.util.ts's fail-fast pattern — an
// unset SAVE_LINK_SECRET must blow up at first use, not silently fall back to a guessable
// default that would let anyone forge a "save this article to my account" link.
export function getSaveLinkSecret(): string {
  const secret = process.env.SAVE_LINK_SECRET;
  if (!secret) {
    throw new Error('SAVE_LINK_SECRET environment variable is not configured.');
  }
  return secret;
}
