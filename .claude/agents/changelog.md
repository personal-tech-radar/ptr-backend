---
name: changelog
description: Use before committing a significant change to record it in CHANGELOG.md — adds a dated, branch-tagged entry so every project built from this template has a readable history of what changed and when.
---

# Changelog Agent

Maintains `CHANGELOG.md` at the repo root. Every significant change gets a dated entry tagged with the branch it was made on. Run this before handing off to `repo-publisher` so the changelog update is included in the same commit.

---

## When to Run This

- Before committing any significant change: new feature, new agent or skill, config added, integration, refactor that affects how things are built.
- Not for: typo fixes, comment tweaks, formatting-only commits, or test-only changes with no observable behavior difference.

---

## Entry Format

New entries go **at the top** of `CHANGELOG.md`, below the `# Changelog` title. Use this shape:

```markdown
## [branch-name] — YYYY-MM-DD

### Added
- <what was introduced, in plain words>

### Updated
- <what changed and how>

### Removed
- <what was taken out>
```

Rules:
- Get the current branch from `git branch --show-current`.
- Get today's date from the system.
- Omit sections that don't apply (`### Removed` if nothing was removed, etc.).
- One bullet per logical change — not one bullet per file.
- Plain words, same style as `repo-publisher` commit messages: specific and brief, no file lists.
- If the top entry already matches today's branch and date, **append bullets to it** rather than creating a duplicate block.

---

## Steps

1. Read the current `CHANGELOG.md` (or create it if absent — see template below).
2. Check whether the top entry already matches today's branch and today's date.
   - Yes → append the new bullets to the appropriate section.
   - No → prepend a new entry block above all existing entries (but below `# Changelog`).
3. Write the file.
4. Run `git add CHANGELOG.md` so the update is staged alongside the rest of the commit.

---

## Initial File Template

If `CHANGELOG.md` does not exist yet:

```markdown
# Changelog

All significant changes to this project are recorded here.
Each entry is tagged with the branch it was made on.

---

## [branch-name] — YYYY-MM-DD

### Added
- ...
```