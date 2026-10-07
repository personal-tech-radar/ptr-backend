# Backend administration API

All routes below require the existing `administrator-bearer` JWT. User JWTs and `X-API-KEY`
do not grant administrator access. The running `/docs-json` is the generated OpenAPI contract.
This patch has no frontend changes, new dependencies, schema migrations, or processing changes.

## Dashboard and metric definitions

`GET /admin/dashboard/overview?period=24h|7d|30d` returns `DashboardOverviewResponseDto`.
The default period is `24h`. It includes user totals and activity, source lifecycle counts,
received article cohorts and current pipeline statuses, candidate statuses, digest statuses,
and the existing application identity/environment/uptime plus the latest successful source fetch.
RSS and Atom share the `feeds` group; Web and GitHub Releases remain separate. Group signals
are the persisted source counters, not a new score calculation.

- Every response includes exact UTC `from`/`to` boundaries. Lower bounds are inclusive and
  upper bounds exclusive. DAU begins at the current UTC midnight; WAU/MAU are rolling 7/30 days.
- Active users have at least one retained first user/article open, current save, or latest
  useful/not-useful feedback update in that window. Repeated opens are not recorded, removed
  saves disappear, and earlier feedback values are overwritten. These metrics describe the
  available records, not a complete immutable event log.
- Current aggregates exclude soft-deleted primary records. Activity excludes deleted users
  and articles. Persisted source signal counters retain their existing domain semantics.
- Article period status counts describe the current states of articles **received** in the
  window; they do not claim to count historical state transitions. All-time status counts
  describe all retained non-deleted articles.
- Digest period counts use `sentAt` for currently sent records, `updatedAt` for currently
  failed records, and `createdAt` for draft/skipped-empty records. Failure timestamps and
  delivery-attempt history do not exist independently. Resends do not create new digest rows.
- All-time means retained records, not records previously purged. Preview and scheduled
  digests are both included; the digest list can separate them by delivery mode.
- `lastSuccessfulUpdateAt` is the latest stored successful source fetch, or `null`.
  Backend `status: ok` means the application served the request; no infrastructure probes,
  alerts, or new scheduling predictions are added.

Use returned boundaries, rather than recomputing relative periods, for exact drill-down links.

## Endpoint and DTO inventory

Collections use `{ data, meta: { total, page, limit, totalPages } }`. The pre-existing administrator
directory keeps its own `{ items, total, page, limit }` contract.

| Endpoint                               | Query / response DTOs                                                                                                                                                          | Added or completed behavior                                                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/dashboard/overview`        | `DashboardOverviewQueryDto`, `DashboardOverviewResponseDto`                                                                                                                    | Typed dashboard aggregates with period definitions                                                                                                                                                                                             |
| `GET /admin/sources`                   | `QuerySourceDto`, `PaginatedAdminSourceResponseDto`, `AdminSourceResponseDto`                                                                                                  | `q`, status/type/category/enabled, `createdFrom/To`, `technologyInterestId`, `streamId`, `sourceGroup`; persisted interaction score and included signal count; `periodArticleCount` and exact period bounds (`period` defaults to rolling 24h) |
| `GET /admin/sources/:id`               | `DashboardOverviewQueryDto`, `AdminSourceDetailResponseDto`                                                                                                                    | Read-only Web recipe, detailed signals, volume aggregates and latest 20 retained ingestion attempts                                                                                                                                            |
| `GET /admin/source-candidates`         | `SourceCandidateListQueryDto`, `PaginatedSourceCandidateResponseDto`                                                                                                           | Status/origin/expectedSourceType/detectedType/taxonomy/stream/creation filters; nullable technology and stream names from existing relations                                                                                                   |
| `GET /admin/source-candidates/:id`     | `SourceCandidateResponseDto`                                                                                                                                                   | Typed nullable provenance, expected type, technology name and stream name                                                                                                                                                                      |
| `GET /admin/articles`                  | `ArticleListQueryDto`, `PaginatedAdminArticleResponseDto`, `AdminArticleListItemDto`                                                                                           | Status/source/type/group/taxonomy/stream, received/published dates, title/URL search; primary stream and persisted quality/final scores                                                                                                        |
| `GET /admin/articles/:id`              | `AdminArticleDetailResponseDto`, `AdminArticleAnalysisResponseDto`                                                                                                             | Metadata/source/extraction, pre-screen, full analysis, numeric scores, technologies/interests/streams and digest eligibility flags                                                                                                             |
| `GET /admin/technology-interests`      | `AdminQueryTechnologyInterestDto`, `PaginatedTechnologyInterestResponseDto`, `AdminTechnologyInterestListItemDto`, `TechnologyRelatedStreamDto`, `TechnologyCoverageCountsDto` | Canonical-name/alias `q` search, kind/includeDeleted; actual related streams and distinct-source lifecycle coverage                                                                                                                            |
| `GET /admin/source-coverage`           | `QuerySourceCoverageDto`, `PaginatedSourceCoverageResponseDto`                                                                                                                 | Actual taxonomy–stream relationships and source lifecycle counts, database pagination                                                                                                                                                          |
| `GET /admin/jobs/summary`              | `AdminQueueSummaryDto[]`                                                                                                                                                       | All five real queues and waiting/active/delayed/paused/prioritized/failed counts                                                                                                                                                               |
| `GET /admin/jobs`                      | `AdminJobsQueryDto`, `PaginatedAdminJobsResponseDto`                                                                                                                           | Queue/state filters and real totals, validated page/limit                                                                                                                                                                                      |
| `GET /admin/jobs/:queue/:jobId`        | `AdminJobResponseDto`, `AdminJobReferenceDto`                                                                                                                                  | Normalized state, timestamps in Unix milliseconds, attempts, redacted failure reason and safe subject reference                                                                                                                                |
| `GET /admin/jobs/failed`               | `AdminJobsQueryDto`, `PaginatedAdminJobsResponseDto`                                                                                                                           | Compatible failed-only view using the same query/serialization; keeps `name` and adds `type`                                                                                                                                                   |
| `GET /admin/digests`                   | `AdminQueryDigestDto`, `PaginatedDigestResponseDto`, `DigestResponseDto`                                                                                                       | Status/type/email/deliveryMode, created/sent/updated ranges, article count and existing delivery metadata/stream pages                                                                                                                         |
| `GET /admin/digests/:id`               | `DigestDetailResponseDto`, `DigestItemResponseDto`, `DigestScoreBreakdownDto`                                                                                                  | Stored bodies/intro/period key, statistics/build-debug snapshots, items and original stored descriptions                                                                                                                                       |
| `GET /admin/users`                     | `QueryUserDto`, `PaginatedUserResponseDto`, `AdminUserListItemDto`, `UserActivityWindowDto`, `UserPeriodActivityDto`, `UserSelectedTaxonomyDto`, `UserSelectedStreamDto`       | Registration/verification/onboarding dates and states; activityPeriod or exact activityFrom/To plus eventType; current selections and per-user activity counts with effective window                                                           |
| `GET /admin/users/analytics`           | `UserAnalyticsQueryDto`, `UserAnalyticsResponseDto`, `UserPopularityResponseDto`, `PopularityItemDto`                                                                          | Defaults to 7d; shared activity counts and top-20 popularity per dimension                                                                                                                                                                     |
| `GET /admin/opens`                     | `AdminQueryOpensDto`, `PaginatedAdminOpensResponseDto`                                                                                                                         | User/article/source/taxonomy/stream and occurredFrom/To filters                                                                                                                                                                                |
| `GET /admin/saved-articles`            | `AdminQuerySavedArticleDto`, `PaginatedAdminSavedArticleResponseDto`                                                                                                           | User/source/taxonomy/stream and occurredFrom/To, alongside existing article/email filters                                                                                                                                                      |
| `GET /admin/article-feedback`          | `AdminQueryArticleFeedbackDto`, `PaginatedAdminArticleFeedbackResponseDto`                                                                                                     | Same event filters, retaining existing useful/not_useful `type` filter                                                                                                                                                                         |
| `GET /admin/user-technology-interests` | `QueryUserTechnologyInterestDto`, `PaginatedUserTechnologyInterestResponseDto`                                                                                                 | Exact userId and technologyInterestId filters                                                                                                                                                                                                  |
| `GET /admin/user-content-streams`      | `QueryUserContentStreamDto`, `PaginatedUserContentStreamResponseDto`                                                                                                           | Exact userId and streamId filters                                                                                                                                                                                                              |
| `GET /admin/user-source-preferences`   | `AdminQueryUserSourcePreferenceDto`, existing response DTO                                                                                                                     | Exact userId alongside sourceId/email filters                                                                                                                                                                                                  |

Supporting schemas include `AdminPeriodResponseDto`, dashboard lifecycle/article/candidate/digest/
signal counts, `SourceTypeOverviewDto`, `SourceVolumeResponseDto`, `SourceAttemptResponseDto`,
typed source/article relationship references, `DigestStatisticsResponseDto`,
`DigestBuildDebugResponseDto`, and `DigestBuildAttemptResponseDto`.
`AdminEventFilterDto` shares event-filter validation. Nullable metadata annotations in
`ArticleResponseDto` and `SourceResponseDto` are corrected to describe actual scalar/date values.

The source list `periodArticleCount` counts retained articles by receipt (`articles.createdAt`)
in its response period. The user list defaults to a rolling seven-day activity window and
returns `activityWindow.from/to`; exact `activityFrom/activityTo` override those boundaries.
`periodActivity.active` means at least one retained meaningful event, and `total` is the sum of
first opens, current saves and latest useful/not-useful feedback in that window. `eventType`
filters list membership without changing the per-user breakdown. If the only activity query
option is `eventType` or `activityTo`, the existing all-time lower bound is retained and
reported as the effective window. Current selections exclude merged/deleted taxonomy entries.
Taxonomy `coverage` counts each retained source once across streams, while each
`relatedStreams[].coverage` counts sources associated with that specific stream. Entries with
no retained source coverage have an empty stream list and zero counts.

## Preserved actions and limitations

Source creation still requires name, URL, type and category, defaults enabled=true and trustScore=50,
validates feeds/discovery, rejects duplicates, and lets Web sources default their entry URL to their
own URL. `CreateSourceDto` is unchanged. The Web recipe cannot be edited through the update DTO.
Source validation/ingestion retries and candidate retry retain their original domain paths.

`POST /admin/technology-interests` still creates or resolves taxonomy and queues discovery through
the existing flow. Name/alias updates, duplicate merge, discovery, and stream updates are unchanged.
Stream keys remain immutable. Coverage now returns only existing `source_coverages` relationships
with retained sources; it does not infer coverage from article tags or manufacture a taxonomy × stream
matrix. `zeroActiveCoverage` finds associated groups with zero active sources. `sourceStatus` limits
which source relationships contribute to counts. Disabled streams remain visible when associated.

Article actions remain domain analysis retry and soft-delete. No editing of analysis/taxonomy/status
or digest inclusion was introduced. Stored digest items can still show soft-deleted articles in the
administrator detail. This read path is separate from resend/build queries.

Queue pagination uses stable queue/state order and BullMQ's native order within a state, not a
global timestamp sort. Counts and pages are operational snapshots and may change as workers run.
Waiting and paused lists are counted separately. Pending cancellation retains its existing
waiting/delayed/paused/prioritized allowlist; active/completed/failed work is rejected. No generic
retry was added. Jobs without a persisted subject return a null reference; a personal-digest job
before a digest exists can reference its user. Raw job payloads are not exposed.

Digest descriptions come from recognized stored email markup, not the current article analysis.
Unrecognized older templates return `shortDescription: null` and `descriptionSource: unavailable`;
the original HTML/text remains available. No description-snapshot migration or resend/preview
behavior changes were introduced. Source validation has no independent historical attempt table;
the latest result and retained ingestion attempts are exposed. Ingestion volume covers retained
attempts and cannot reconstruct purged history.

Popularity ranks by period active users, then current selecting users, then name/ID. Selection
counts describe current taxonomy/stream choices; source selection counts mean users with nonzero
persisted source signals. Period opens/saves/feedback are separate engagement counts. Opens with
occurredFrom/To use canonical first user/article opening timestamps; the default opens endpoint
continues to list personal links, including unopened links.

Administrators retain existing authentication/logout/list/create/own-password behavior. No roles,
deletion endpoint, password reset for others, or audit system was added.

## Verification

The HTTP suite in `test/admin-http.e2e-spec.ts` talks to the running server and real PostgreSQL/
Redis. It reads login credentials from the local `.env` without printing them. Run inside the app
container (default HTTP origin is `http://localhost:3000`):

```sh
docker compose -f docker-compose.test.yml exec -T app npm run test:e2e -- --runInBand
npm test -- --runInBand
npx tsc --noEmit
npx tsc --noEmit -p test/tsconfig.json
npx eslint '{src,apps,libs,test}/**/*.ts'
npm run build
```

The suite creates uniquely identified local fixtures, keeps user digest delivery disabled, and
removes only its own fixtures afterward. Source-create tests use a local HTTP fixture feed. The
retry test supplies stored completed analysis and a current publication date, exercising the real
worker without an LLM request. No existing administrator password or Docker data volume is reset.
The ignored `reports/` directory records exact run results and any pre-existing verification debt.
