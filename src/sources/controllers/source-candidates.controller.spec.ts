jest.mock('jsdom', () => ({ JSDOM: jest.fn() }));
jest.mock('@mozilla/readability', () => ({ Readability: jest.fn() }));

import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { SourceCandidatesController } from './source-candidates.controller';

describe('SourceCandidatesController', () => {
  it('documents and returns candidate retry as HTTP 200', () => {
    // Metadata is attached to the unbound controller method by Nest's decorator.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const retry = SourceCandidatesController.prototype.retry;
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, retry)).toBe(200);
  });
});
