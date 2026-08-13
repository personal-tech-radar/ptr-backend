# AI analysis

## Purpose and architecture

Analysis is global and two-stage. `AiAnalysisService` owns provider calls and persistence while the
processor owns BullMQ execution, retry state, metrics, and sanitized terminal failures.

## Data flow

Pre-analysis receives supported streams and current taxonomy and decides only whether processing
continues. Full analysis stores quality, summaries, normalized difficulty, stream membership,
primary stream, and taxonomy links in `ArticleAnalysis` and related link entities.

## Invariants and extension

Skipped articles remain for audit and deduplication. One effective analysis row exists per article;
provider credentials never enter logs or failed-job history. Personalization never invokes an LLM.
Add provider behavior behind the existing structured parsing and sanitization boundary.
