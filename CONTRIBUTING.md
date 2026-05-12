# Contributing to Trove

Thanks for your interest. Trove is small — three kinds of contributions are useful right now.

## 1. New modules

The single highest-value contribution. Each module makes Trove useful for one more service.

To add a module:

1. Fork this repo
2. Create a directory under `library/<service-name>/` with two files:
   - `module.md` — see [SPEC.md §2.1](./SPEC.md) for frontmatter schema and writing guidelines
   - `credentials.example.json` — placeholder values, **no real secrets**
3. Open a PR

**Quality bar for `module.md`** (this is what makes Trove valuable, not the format itself):

- **Lead with constraints / gotchas / footguns**, not the happy path. AI is most likely to mess up where you'd expect a senior engineer to mess up too. Document those first.
- **Real, copy-pasteable code**, not pseudocode. TypeScript preferred, mention Python alternative if it's significantly different.
- **Pricing / quota / rate-limit pitfalls** in a dedicated section. AI doesn't think about money unless you tell it to.
- **Error code table** for the most common 4xx/5xx codes with one-line interpretations.
- See [`library/minimax/module.md`](./library/minimax/module.md) for a reference implementation.

## 2. Spec feedback

The format is still pre-1.0. If you find an awkward edge case while writing a module — for example a service whose auth doesn't fit the current `credentials` schema — open an issue describing the case.

Spec changes that affect existing modules require a version bump (`trove_spec` field).

## 3. Tooling

The CLI surface is intentionally tiny ([SPEC.md §8](./SPEC.md)):
- `trove ui`
- `trove ai new <url|.env|"desc">`
- `trove validate <module>`
- `trove list`

If you want to contribute code, start by reading [ROADMAP.md](./ROADMAP.md) to see what's planned. Open an issue first to discuss before writing significant code.

## What we won't accept

- `trove inject` / `trove init` / project-level `.trove/` overrides — these are intentional non-goals (see ROADMAP.md "Out of scope")
- Modules with hard-coded real credentials in `credentials.example.json`
- Cloud sync / SaaS features

## Module style guide

- File naming: lowercase with hyphens (`my-service`, not `MyService`)
- Frontmatter `applies_to`: list specific use cases, not generic categories
- Frontmatter `credentials.<KEY>.help`: include the URL where users get the key
- Multi-account services: name modules with suffixes (`stripe-personal`, `stripe-clientA`) instead of building override systems

## Code of conduct

Be kind. Be specific. Be wrong sometimes — that's how we get to "right" together.
