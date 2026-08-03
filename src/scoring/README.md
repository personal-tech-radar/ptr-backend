# Scoring

## Purpose

`RelevanceScoringService` is a pure deterministic service shared by the personal feed, digest
builders, and anonymous preview. Callers resolve database-backed inputs before invoking it.

## Formula

For an article eligible by selected stream, the weighted base score is:

```text
base = technologyMatch × technologyWeight
     + interestMatch × interestWeight
     + complexityMatch × complexityWeight
     + qualityScore × qualityWeight
     + recencyScore × recencyWeight
```

Weights and recency windows are defined in `scoring.types.ts`. Taxonomy overlap is neutral 50 for an
untagged article, 0 for no overlap, 60 for one match, 80 for two, and 100 for three or more. Missing
complexity and quality use neutral defaults. Recency uses the shared fresh/recent/older buckets.

The bounded personal source adjustment is added after the weighted base score. Feedback, saves, and
opens influence ranking only through that adjustment; they do not modify global analysis or public-feed
ordering.

## Invariants

- The service is deterministic for identical input and configuration.
- Stream mismatch is the only hard exclusion.
- Global article analysis is user-independent.
- Source adjustments are bounded and cannot permanently exclude a source.
- Feed and digest callers share this implementation.
