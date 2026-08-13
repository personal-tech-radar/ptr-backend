# Redirects and tracking

## Purpose and architecture

The redirects module separates personal tracking from anonymous public clicks. Controllers resolve
opaque identifiers through `RedirectsService` and return HTTP redirects; they accept no caller-
supplied destination.

## Data flow

Personal UUID links record one `UserArticleOpening`, increment first-open counters, and apply one
source signal inside the user-actions transaction boundary. Repeated visits still redirect. Public
article-ID redirects increment only the article's public click counter.

## Invariants and extension

Destinations come from persisted articles, preventing open redirects. Public clicks never acquire a
user identity or affect personalization. Permanent email actions live in `user-actions`; new redirect
contexts must preserve opaque IDs and avoid profile data in URLs or rendered pages.
