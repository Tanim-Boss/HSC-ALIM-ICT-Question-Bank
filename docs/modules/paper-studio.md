# Paper Studio and exports

**Purpose and scope.** Define the editable question-paper workflow, output paths and separation from the Question Bank. It describes planned capabilities; no document model, worker or export implementation exists yet.

## Responsibilities and boundaries

Paper Studio owns a structured, editable paper document: title/information, duration, sections, question entries, ordering, marks and instructions. A user may select questions, edit the **paper's** content, preview and export, but these edits must not mutate the source Question Bank or a generated PDF. Authorized access to selected versions, paper ownership and sensitive answer content is checked server-side. Exact persistence, versioning and allowed edits are **OD-28**.

```text
Authorized question selection → editable paper model → shared content renderer / print styles
   ├─ browser print dialog → physical print or Save as PDF (primary)
   └─ authorized async job → Chromium worker → stored PDF snapshot → authorized retrieval
```

Browser print is the primary PDF path; server snapshots for archive/sharing/batch use a dedicated asynchronous worker, not Chromium in a synchronous web request. The worker and queue host are unresolved; they remain an execution boundary inside the modular-monolith architecture. Server snapshots are the intended archived copy, not an untrusted client upload.

## Output contract and safety

| Output | Required behavior |
|---|---|
| Browser PDF/print | Reuse safe question content components and print styling; text remains selectable, with correct Bengali shaping, page breaks and fonts. |
| Server PDF snapshot | Render an authorized paper version in a worker, wait for fonts/assets, upload the result to object storage and protect job/artifact access. Do not block the request for a batch render. |
| JSON | Canonical structured document export; valid and re-importable/round-trippable once its schema is approved. |
| TXT | Render content blocks as text; preserve code fences and math source rather than scraping an image. |
| Base64 | Encoding of explicitly named JSON or PDF bytes, not a separate document format. Use UTF-8 bytes for text; decode with the intended strict error policy. |

No DOM-to-canvas/raster PDF text. Diagrams may remain appropriately encoded images; the prohibition is on replacing text with a screenshot. Do not put a Base64 PDF in a URL or local storage; the blueprint suggests normal file download above roughly 2 MB because Base64 expands data. Its sample `TextDecoder` does not reject malformed UTF-8 by default, so strict handling requires an explicit implementation decision/test (OD-28).

The README shows answer-key settings for papers, but does not define which users may receive which content. Standard student exports must not disclose unreleased keys or circumvent an active exam; authorized answer-bearing export is not assumed until OD-14/OD-16 are resolved. No student-facing exam API returns an answer key.

## Acceptance criteria

- Editing/reordering a paper does not change bank data; JSON round-trips according to an approved schema.
- Multi-page print and worker snapshots preserve Bengali conjuncts, diagrams, question/option grouping, margins and marks; text is selectable/searchable and fonts are available.
- UTF-8/Base64 round-trips Bangla, emoji and empty/large strings; malformed inputs follow the approved error behavior.
- A large paper does not block the web request; jobs, paper versions and downloads are owner-authorized and survive controlled retries without unapproved data leakage.

## Dependencies

Depends on [Question Bank](question-bank.md) for authorized versions/assets, [authorization](../security/authorization.md), the shared [renderer](../design/component-architecture.md) and [typography](../design/typography.md), object storage, and a planned queue/Chromium worker for server snapshots.

## OPEN DECISION

[OD-02, OD-10, OD-14, OD-16, OD-18–OD-20 and OD-28](../architecture/technology-decisions.md#open-decision-register) cover worker/queue, version and key release, permissions, content/assets, retention and paper/job/encoding details.

## Related documentation

[Database relationships](../database/entity-relationships.md) · [API architecture](../api/api-architecture.md) · [Deployment](../deployment/deployment-architecture.md) · [Testing](../development/testing-strategy.md)
