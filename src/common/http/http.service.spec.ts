import { HttpService } from './http.service';

describe('HttpService', () => {
  const logger = { info: jest.fn(), error: jest.fn() };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not retry permanent 403 responses, including non-JSON bodies', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      headers: { get: () => null, entries: () => [] },
      text: async () => '<html>blocked</html>',
    } as unknown as Response);
    const service = new HttpService(logger as any);

    await expect(service.getText('https://example.com/blocked')).rejects.toThrow(
      'HTTP 403: Forbidden',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'HTTP request failed after all retries',
      expect.objectContaining({ status: 403, attempts: 1 }),
    );
  });
});
