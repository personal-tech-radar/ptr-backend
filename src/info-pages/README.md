# Info pages

The info-pages domain stores administrator-managed static content for frontend pages. Each page
has a title, an Editor.js OutputData object in `fullText`, publication state, timestamps, and soft
deletion. PostgreSQL stores the document as `jsonb`.

- `GET /info-pages` and `GET /info-pages/:id` are API-key-only public reads and expose active pages.
- `GET|POST|PATCH|DELETE /admin/info-pages` are administrator-JWT CRUD operations.
- Public list responses omit `fullText`; the detail response includes it.
- Deletes use TypeORM soft deletion, so historical records remain recoverable for administration.
- The bootstrap migration seeds example `Legal Notice`, `Privacy Policy`, and `Cookies Policy`
  pages. They are editable examples, not legal advice; review them before publishing.

Create and update requests accept an object (not a JSON-encoded string) with optional Editor.js
`time` and `version`, and a non-empty `blocks` array. Supported blocks are `header` (levels 2–6;
the page title is the H1) and `paragraph`, each with non-empty `data.text`. Optional block `id`
values are retained. Inline formatting allows `b`, `strong`, `i`, `em`, `u`, `s`, `del`, `ins`,
`mark`, `code`, `sub`, `sup`, and `br`. Links allow only an `href` attribute using `http`, `https`,
or `mailto`; unsupported tags, attributes, and URL protocols are rejected.

The forward migration converts legacy text documents to Editor.js OutputData, maps legacy
`heading` blocks to `header`, and wraps plain or unrecognized content as escaped paragraph text so
it remains recoverable. Invalid/unsafe inline markup is preserved as escaped text. The rollback
stores the converted JSON document as text; it does not reconstruct the legacy editor-neutral
shape. Seed rollback matches the converted default document so it can still remove only unchanged
examples.

This changes the API contract from a string to an object. Deploy the backend and both the admin and
portal frontend contract updates together; older clients that send or expect a string are not
compatible with the new API.
