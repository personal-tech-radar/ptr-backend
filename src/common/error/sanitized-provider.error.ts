export interface SanitizedProviderErrorContext {
  provider: string;
  status: number | null;
  requestType: string;
  retryable: boolean;
  taxonomyId?: string;
  articleId?: string;
}

/** Safe to throw across a BullMQ worker boundary and retain in failed job history. */
export class SanitizedProviderError extends Error {
  readonly context: SanitizedProviderErrorContext;

  constructor(context: SanitizedProviderErrorContext) {
    const identifier = context.taxonomyId
      ? ` taxonomy=${context.taxonomyId}`
      : context.articleId
        ? ` article=${context.articleId}`
        : '';
    super(
      `Provider request failed: provider=${context.provider} status=${context.status ?? 'unknown'} requestType=${context.requestType} retryable=${context.retryable}${identifier}`,
    );
    this.name = 'SanitizedProviderError';
    this.context = context;
  }
}
