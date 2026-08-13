# Taxonomy

## Purpose

This module owns the global `TechnologyInterest` catalog, five fixed content streams, and user
selection tables. Technologies and interests share one table and are distinguished by `kind`.

## Discovery flow

1. `TechnologyInterestCommandService.createOrReuse` passes the name to the resolver.
2. Resolution checks normalized same-kind names, aliases, and similarity matches before creating a
   row.
3. Only a new row reserves quota and enqueues one deterministic `taxonomy-{id}` BullMQ job.
4. `TaxonomySourceDiscoveryProcessor` asks the configured LLM for structured source proposals.
5. Technologies use all five streams; interests use industry pulse, engineering experience, and
   expert opinions and practices only.
6. Every proposal enters the shared sources candidate coordinator for normalization, deduplication,
   retries, extraction, relevance validation, activation, or terminal rejection.
7. The active source retains only the taxonomy and stream relationship that caused discovery.
8. Normal ingestion persists publications; pre-analysis skips unsupported items and relevant items
   continue to one global analysis row and deterministic score.
9. The initiating user's feed becomes eligible when its taxonomy and streams match the article.

Discovery requests are business records, not one row per retry. Their lifecycle is `queued` →
`running` → `completed` or `failed`; retry count and last error remain on the same row.

## Invariants

- Catalog rows are unique by kind and normalized identity.
- User selection replacement is set-based and transactional.
- Interests never discover releases or security.
- No manual candidate approval is required.
- Failed candidates retain a terminal reason.
- Existing selection consumes no quota and enqueues no discovery.

## Extension points

Add matching rules in the resolver, proposal changes in the processor/prompt, and validation changes
in `src/sources`. Keep candidate persistence and onboarding centralized in the sources module.
