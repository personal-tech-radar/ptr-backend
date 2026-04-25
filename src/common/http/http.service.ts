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
            ...headers,
          },
          signal: controller.signal,
        };

        if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        const responseData = await response.json();

        const result: HttpResponse<T> = {
          status: response.status,
          data: responseData,
          headers: Object.fromEntries(response.headers.entries()),
        };

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (attempt > 0) {
          this.logger.info(`HTTP request succeeded after ${attempt} retries`, { url });
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        const isLastAttempt = attempt === retries;

        if (isLastAttempt) {
          this.logger.error('HTTP request failed after all retries', {
            url,
            method,
            attempts: retries + 1,
            error: lastError.message,
          });
        } else {
          this.logger.info(`HTTP request failed, retrying (${attempt + 1}/${retries})`, {
            url,
            error: lastError.message,
          });
          await this.delay(retryDelay * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  async get<T = any>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'GET', url, headers });
  }

  async post<T = any>(url: string, body: any, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'POST', url, body, headers });
  }

  async put<T = any>(url: string, body: any, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PUT', url, body, headers });
  }

  async patch<T = any>(url: string, body: any, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PATCH', url, body, headers });
  }

  async delete<T = any>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'DELETE', url, headers });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}