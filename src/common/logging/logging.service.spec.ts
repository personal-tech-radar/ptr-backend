import { Logger } from '@nestjs/common';
import { LoggingService, sanitizeLogText } from './logging.service';

describe('LoggingService credential sanitization', () => {
  it('removes complete and vendor-masked OpenAI API-key fragments', () => {
    const text =
      '401 Incorrect API key provided: sk-proj-************************X9MA. ' +
      'fallback sk-live-secret123';

    expect(sanitizeLogText(text)).toBe(
      '401 Incorrect API key provided: [REDACTED]. fallback [REDACTED_API_KEY]',
    );
  });

  it('sanitizes the error stack before passing it to Nest Logger', () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const error = new Error(
      'Incorrect API key provided: sk-proj-************************X9MA. Request rejected',
    );

    new LoggingService('Test').error('Provider request failed', error, {
      provider: 'openai',
      status: 401,
      articleId: 'article-1',
    });

    expect(loggerError).toHaveBeenCalledWith(
      'Provider request failed {"provider":"openai","status":401,"articleId":"article-1"}',
      expect.not.stringContaining('X9MA'),
    );
    expect(loggerError).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Incorrect API key provided: [REDACTED]'),
    );
  });
});
