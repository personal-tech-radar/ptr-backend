# User Article Actions

## Purpose

This module owns saved articles, permanent personal links, first-open records, and opaque email
actions. Controllers expose JWT-protected save APIs and unauthenticated UUID routes without
revealing user identity.

## Data flow and invariants

`SavedArticleService`, `PersonalArticleLinkService`, and `ArticleFeedbackService` coordinate each
logical interaction with `UserSourcePreferenceService` inside one PostgreSQL transaction. Unique
user/article constraints make saves and openings idempotent; feedback has one replaceable current
value. Aggregate counters and the primary interaction always commit or roll back together.

Redis and redirects are outside the PostgreSQL transaction boundary. Permanent action and tracking
UUIDs remain stable, while repeated use performs no duplicate interaction effect. Extend article
actions through the same transaction-aware service boundary rather than writing aggregates from a
controller.
