# Users and profiles

## Purpose and architecture

This module owns normal-user persistence, profiles, onboarding, and user-scoped taxonomy and stream
selection. Controllers delegate reads to `UserQueryService`, mutations to `UserCommandService`, and
onboarding replacement to `OnboardingService`.

## Data and flow

`User` is the account/profile aggregate; taxonomy and stream links live in the taxonomy module.
Onboarding resolves catalog inputs, synchronizes both link sets transactionally, updates the profile,
and invalidates the user's feed version only when effective feed configuration changes.

## Invariants and extension

Verified email plus completed onboarding is required for feeds and scheduled digests. Ordinary users
have five-item limits per taxonomy kind. Add settings through validated DTOs and classify whether a
field affects feed cache identity before invalidating it.
