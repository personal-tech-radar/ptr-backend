# Skill: integration-pattern

Use this skill when implementing an integration with an external HTTP service. It covers module wiring, HttpService usage, retry/backoff behavior, and how to structure transport vs. business logic.

---

## Core Rules

- Use `HttpService` from `src/common/http/`. Do not introduce axios, got, node-fetch, or any other HTTP client without explicit approval.
- Retry and backoff are built into `HttpService`. Do not add custom retry loops on top of it.
- Override retry behavior per-call only when the external service explicitly requires it (e.g., non-retriable endpoints).
- Keep transport logic (HTTP calls, request/response mapping) separate from business logic.

---

## Module Wiring

`HttpModule` is not global. Import it into every feature module that needs it:

```ts
import { Module } from '@nestjs/common';
import { HttpModule } from '../common/http/http.module';
import { ExternalApiService } from './services/external-api.service';
import { LoggingService } from '../common/logging/logging.service';

@Module({
  imports: [HttpModule],
  providers: [
    ExternalApiService,
    { provide: LoggingService, useFactory: () => new LoggingService('ExternalApiService') },
  ],
  exports: [ExternalApiService],
})
export class ExternalApiModule {}
```

---

## Service Structure

Keep one integration service per external system. Split responsibilities:

| Class | Responsibility |
|---|---|
| `ExternalApiService` | Transport: HTTP calls, request building, raw response mapping |
| Domain service / caller | Business logic: when to call, how to use the result |

The integration service should not make business decisions. The calling service should not build HTTP requests.

---

## HttpService Usage

```ts
import { Injectable } from '@nestjs/common';
import { HttpService } from '../../common/http/http.service';
import { LoggingService } from '../../common/logging/logging.service';

@Injectable()
export class ExternalApiService {
  private readonly baseUrl = process.env.EXTERNAL_API_URL;

  constructor(
    private readonly http: HttpService,
    private readonly logger: LoggingService,
  ) {}

  async fetchItem(id: string): Promise<ExternalItemDto> {
    const response = await this.http.get<ExternalItemDto>(`${this.baseUrl}/items/${id}`);
    return response.data;
  }

  async createItem(payload: CreateExternalItemDto): Promise<ExternalItemDto> {
    const response = await this.http.post<ExternalItemDto>(`${this.baseUrl}/items`, payload);
    return response.data;
  }
}
```

---

## Retry and Backoff Behavior

`HttpService` reads from environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `HTTP_TIMEOUT_MS` | `10000` | Request timeout per attempt |
| `HTTP_RETRIES` | `3` | Number of retry attempts |
| `HTTP_RETRY_DELAY_MS` | `1000` | Base delay; multiplied linearly per attempt |

To override for a specific call, pass options via `this.http.request(options)`:

```ts
const response = await this.http.request<T>({
  method: 'POST',
  url: `${this.baseUrl}/webhooks`,
  body: payload,
  retries: 0,       // no retries for webhooks
  timeout: 5000,
});
```

---

## Error Handling

- Let `HttpService` throw on non-2xx responses. Catch at the calling service level if domain-specific error handling is needed.
- Log the failure with context: url, method, and error message.
- Map external errors to NestJS exceptions (`BadGatewayException`, `ServiceUnavailableException`) at the boundary — never let raw HTTP errors propagate to the controller.

```ts
async fetchItem(id: string): Promise<ExternalItemDto> {
  try {
    const response = await this.http.get<ExternalItemDto>(`${this.baseUrl}/items/${id}`);
    return response.data;
  } catch (error) {
    this.logger.error('Failed to fetch item from external API', error, { id });
    throw new BadGatewayException('External service unavailable');
  }
}
```

---

## Environment Variable Convention

New integrations must add their base URL and credentials to `.env.example`:

```
# External API
EXTERNAL_API_URL=https://api.example.com
EXTERNAL_API_KEY=your-api-key
```

---

## Post-Integration Checklist

- [ ] `HttpModule` imported in the feature module
- [ ] Transport logic isolated in a dedicated integration service
- [ ] Business logic is not inside the integration service
- [ ] Error handling maps external errors to NestJS exceptions
- [ ] No custom retry logic added on top of `HttpService`
- [ ] New env variables added to `.env.example`
- [ ] New env variables documented in `README.md`