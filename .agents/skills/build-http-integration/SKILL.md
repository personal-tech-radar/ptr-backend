---
name: build-http-integration
description: Implement or modify an integration with an external HTTP service, including transport services, retries, error mapping, environment variables, and escalating fallback strategies. Use when code calls a third-party API or fetches external content. Do not use for internal NestJS service-to-service calls without HTTP.
---

# Build an HTTP Integration

## Boundaries

- Use `HttpService` from `src/common/http/`; do not add another HTTP client without approval.
- Import `HttpModule` into each feature module that needs it.
- Keep one transport service per external system.
- Keep request construction and response mapping in the transport service.
- Keep business decisions in the calling domain service.

## Reliability

- Rely on `HttpService` retry, timeout, and backoff behavior.
- Override retries only when endpoint semantics require it.
- Let the HTTP boundary map transport failures to appropriate NestJS exceptions.
- Log method, target, identifiers, and the useful error context without secrets.

## Fallback chains

- Order strategies from cheap, fast, and deterministic to expensive or risky.
- Stop at the first validated success.
- Persist the successful strategy when repeated discovery benefits from it.
- Fall back through the chain and update the preference when the saved strategy fails.
- Treat AI suggestions as untrusted proposals and revalidate them through the same real path before use or persistence.

## Completion

- Add new URLs and credentials to `.env.example`.
- Document operationally relevant configuration in `README.md`.
- Test transport mapping, domain error behavior, and any retry exception.
