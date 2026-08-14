# Info pages

The info-pages domain stores administrator-managed static content for frontend pages. Each page
has a title, text `fullText`, publication state, timestamps, and soft deletion. The text normally
contains the same JSON document string used by the frontend editor, keeping storage flexible
without coupling PostgreSQL to a particular block schema.

- `GET /info-pages` and `GET /info-pages/:id` are API-key-only public reads and expose active pages.
- `GET|POST|PATCH|DELETE /admin/info-pages` are administrator-JWT CRUD operations.
- Public list responses omit `fullText`; the detail response includes it.
- Deletes use TypeORM soft deletion, so historical records remain recoverable for administration.
- The bootstrap migration seeds example `Legal Notice`, `Privacy Policy`, and `Cookies Policy`
  pages. They are editable examples, not legal advice; review them before publishing.

The expected text payload is an editor-neutral JSON string following the block-oriented shape used
by the Znak information-pages domain, for example `{"blocks":[{"type":"paragraph","data":{"text":"..."}}]}`.
