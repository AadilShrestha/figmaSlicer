# Domain Docs

This repo uses single-context domain documentation.

## Before exploring, read

- `CONTEXT.md` at repo root, when present
- Relevant ADRs under `docs/adr/`

If these files do not exist, proceed silently. Create them lazily when domain terms or decisions need recording.

## Layout

```
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Vocabulary

Use terms defined in `CONTEXT.md`. Avoid synonyms the glossary rejects.

If a needed concept is missing, reconsider the terminology or note the gap for domain modeling.

## ADR conflicts

Explicitly flag output that contradicts an existing ADR rather than silently overriding it.
