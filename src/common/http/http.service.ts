import { Injectable } from '@nestjs/common';
import { LoggingService } from '../logging/logging.service';
import { HttpRequestOptions } from './http-request-options.interface';
import { HttpResponse } from './http-response.interface';

@Injectable()
export class HttpService {
  private readonly defaultTimeout: number;
  private readonly defaultRetries: number;
  private readonly defaultRetryDelay: number;

  constructor(private readonly logger: LoggingService) {
    this.defaultTimeout = parseInt(process.env.HTTP_TIMEOUT_MS || '10000', 10);
    this.defaultRetries = parseInt(process.env.HTTP_RETRIES || '3', 10);
    this.defaultRetryDelay = parseInt(process.env.HTTP_RETRY_DELAY_MS || '1000', 10);
  }

  async request<T = any>(options: HttpRequestOptions): Promise<HttpResponse<T>> {
    const {
      method,
      url,
      headers = {},
      body,
      timeout = this.defaultTimeout,
      retries = this.defaultRetries,
      retryDelay = this.defaultRetryDelay,
      responseType = 'json',
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8',
            'User-Agent': `PersonalTechRadar/${process.env.APP_NAME || 'backend'} (+${process.env.APP_URL || 'http://localhost'})`,
            ...headers,
          },
          signal: controller.signal,
        };

        if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        const responseText = await response.text();
        let responseData: unknown = responseText;
        if (responseType !== 'text' && responseText.length > 0) {
          try {
            responseData = JSON.parse(responseText);
          } catch {
            responseData = responseText;
          }
        }

        const result: HttpResponse<T> = {
          status: response.status,
          data: responseData as T,
          headers: Object.fromEntries(response.headers.entries()),
        };

        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as Error & {
            status?: number;
            retryAfter?: string;
          };
          error.status = response.status;
          error.retryAfter = response.headers.get('retry-after') ?? undefined;
          throw error;
        }

        if (attempt > 0) {
          this.logger.info(`HTTP request succeeded after ${attempt} retries`, { url });
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        const isLastAttempt = attempt === retries;

        const status = this.errorStatus(lastError);
        const retryable = status === 429 || status === null || status >= 500;

        if (isLastAttempt || !retryable) {
          this.logger.error('HTTP request failed after all retries', {
            url,
            method,
            attempts: attempt + 1,
            status,
            error: lastError.message,
          });
          break;
        } else {
          this.logger.info(`HTTP request failed, retrying (${attempt + 1}/${retries})`, {
            url,
            status,
            error: lastError.message,
          });
          await this.delay(this.retryDelay(lastError, retryDelay, attempt));
        }
      }
    }

    throw lastError;
  }

  async get<T = any>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'GET', url, headers });
  }

  async getText(url: string, headers?: Record<string, string>): Promise<HttpResponse<string>> {
    return this.request<string>({ method: 'GET', url, headers, responseType: 'text' });
  }

  async post<T = any>(
    url: string,
    body: any,
    headers?: Record<string, string>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'POST', url, body, headers });
  }

  async put<T = any>(
    url: string,
    body: any,
    headers?: Record<string, string>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PUT', url, body, headers });
  }

  async patch<T = any>(
    url: string,
    body: any,
    headers?: Record<string, string>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PATCH', url, body, headers });
  }

  async delete<T = any>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'DELETE', url, headers });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private errorStatus(error: Error): number | null {
    const status = (error as Error & { status?: unknown }).status;
    return typeof status === 'number' ? status : null;
  }

  private retryDelay(error: Error, fallback: number, attempt: number): number {
    const retryAfter = (error as Error & { retryAfter?: string }).retryAfter;
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, fallback), 30_000);
      const date = Date.parse(retryAfter);
      if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), fallback), 30_000);
    }
    return Math.min(fallback * (attempt + 1), 30_000);
  }
}
