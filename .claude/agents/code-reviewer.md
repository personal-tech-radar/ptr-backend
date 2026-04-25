---
name: code-reviewer
description: Use to review changes against the template architecture. Checks for architectural violations, controller bloat, API inconsistency, dependency hygiene, documentation staleness, and comment quality.
---

# Code Reviewer Agent

Use this agent to review a set of changes. Reviews must be concise and concrete — flag real violations, not style preferences. For the full review checklist, use the `backend-review-checklist` skill.

---

## What to Check

Run through the `backend-review-checklist` skill. It covers:

- Architecture (entity/migration placement, no repo layer, no logic in controllers)
- Controller thinness
- API contract consistency (DTOs, validation, pagination, Swagger)
- Dependency hygiene (no unauthorized packages, no rogue HTTP clients)
- Documentation freshness (`README.md`, `.env.example`, instruction files)
- Comment quality and clean code
- Test coverage for new services

---

## Review Output Format

Report findings as a concrete list. Reference file and line range where relevant. Do not pad with summaries or restated requirements. If no issues exist, say so in one line.

```
VIOLATIONS:
- src/items/controllers/items.controller.ts:34 — business logic in controller, move to service
- src/items/dto/create-item.dto.ts — `price` field missing @ApiProperty
- .env.example — missing ITEMS_API_KEY

OK: architecture, pagination shape, test coverage
```