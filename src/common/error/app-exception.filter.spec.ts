import { AppExceptionFilter, redactSensitiveQueryValues } from './app-exception.filter';

describe('redactSensitiveQueryValues', () => {
  it('redacts opaque authentication query values while retaining non-sensitive parameters', () => {
    expect(redactSensitiveQueryValues('/auth/verify-email?token=secret&locale=en')).toBe(
      '/auth/verify-email?token=%5BREDACTED%5D&locale=en',
    );
  });

  it('leaves paths without query parameters unchanged', () => {
    expect(redactSensitiveQueryValues('/users/me')).toBe('/users/me');
  });
});

describe('AppExceptionFilter', () => {
  it('preserves payload-too-large status and returns the standard safe envelope', () => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
        getRequest: () => ({ method: 'PATCH', url: '/users/me' }),
      }),
    };

    new AppExceptionFilter().catch(
      Object.assign(new Error('request entity too large'), {
        status: 413,
        type: 'entity.too.large',
      }),
      host as never,
    );

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      statusCode: 413,
      path: '/users/me',
      message: 'Request payload is too large',
      errorCode: 'PAYLOAD_TOO_LARGE',
    });
  });
});
