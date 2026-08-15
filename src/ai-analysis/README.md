# AI analysis

## Purpose and architecture

Analysis is global and two-stage. `AiAnalysisService` owns provider calls and persistence while the
processor owns BullMQ execution, retry state, metrics, and sanitized terminal failures.

## Data flow

Pre-analysis receives supported streams and current taxonomy and decides only whether processing
continues. Full analysis stores quality, short and long summaries, normalized difficulty, stream membership,
primary stream, and taxonomy links in `ArticleAnalysis` and related link entities.

## Invariants and extension

Skipped articles remain for audit and deduplication. One effective analysis row exists per article;
provider credentials never enter logs or failed-job history. Personalization never invokes an LLM.
Add provider behavior behind the existing structured parsing and sanitization boundary.

## Enrichment rules

The model receives the current global taxonomy catalog and article content when available. Technology
and interest signals resolve to canonical catalog entries or aliases; bounded similarity only matches
near spellings and never creates a taxonomy entry during analysis. `shortSummary` is used in lists and
digests. `longSummary` is a grounded, search-friendly three-paragraph explanation for article pages.
The migration that introduced `longSummary` backfilled existing short summaries.

Articles without a trustworthy publication date, or older than the analysis window, remain stored for
deduplication and audit but are not sent to full analysis.

Pre-analysis also requires the source article to be primarily English. Non-English articles are
retained with a `non_english` pre-screen reason and `skipped` status; they never consume full-analysis
work or appear in feeds and digests.
