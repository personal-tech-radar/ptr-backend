export interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  /** Defaults to 'json'. Set to 'text' for non-JSON bodies (HTML, XML, plain text). */
  responseType?: 'json' | 'text';
}