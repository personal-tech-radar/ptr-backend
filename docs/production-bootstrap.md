# Production Bootstrap

`BootstrapLegacyProductCatalog1785945600000` creates the initial global catalog and legacy-user
configuration without network calls, queues, Redis, AI discovery, or runtime Nest services.

## Sources of truth

The migration reads `config/sources.manifest.json` and `config/legacy-user.manifest.json`. Their
SHA-256 checksums are pinned in the migration, making the released migration immutable. Future
manifest changes require a new migration or the normal manifest-sync deployment flow; editing a
released manifest causes this migration to fail visibly instead of silently changing history.

## Created data

- The legacy user is resolved by normalized email and created only when absent.
- Technologies and interests are resolved by kind plus normalized name.
- User taxonomy and stream links use unique natural-key relationships.
- Streams are resolved by stable keys installed by earlier migrations.
- Sources are resolved by manifest URL and receive their declarative type, category, state, trust,
  and extraction configuration.

The manifest currently has no explicit taxonomy-to-source or stream-to-source coverage fields, so
the migration does not invent provenance. The scheduler treats enabled uncovered legacy sources as
operationally due across enabled streams. Personal relevance still comes from globally analyzed
article taxonomy and each user's taxonomy and stream selections.

## Authentication policy

A newly created legacy user receives the non-cryptographic sentinel
`!password-setup-required!`, which cannot authenticate through bcrypt. The user must establish a
password through the normal password-reset/setup flow. Existing users and their password hashes are
never overwritten, and no credential or reusable hash is embedded in source control.

## Idempotency and rollback

All inserts use stable natural keys and conflict-safe relationship creation inside TypeORM's
migration transaction. Existing user-controlled profile values are preserved. The conservative
`down` migration leaves shared business data intact because it cannot prove that later operational
records do not reference it; it never removes articles, analyses, digests, interactions, or users.

## Legacy placeholder compatibility

The user-identity migration retags historical `default_user` feedback and source-preference rows
before converting their columns to UUID foreign keys. If the legacy user is absent, it creates a
non-authenticating placeholder with the password-setup sentinel; the later bootstrap migration
completes its profile and catalog links. A separate legacy-user sync is not required before the
one-shot migration container runs.
