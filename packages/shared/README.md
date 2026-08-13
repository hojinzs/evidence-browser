# @evidence-browser/shared

`@evidence-browser/shared` intentionally exposes two import surfaces:

- The root barrel (`@evidence-browser/shared`, backed by `src/index.ts`) is the CLI vendor surface. The CLI vendor loader requires this root entrypoint when loading the packaged shared library, so removing or shrinking the barrel can break the published CLI.
- Granular subpaths (`@evidence-browser/shared/url`, `@evidence-browser/shared/bundle/security`, and the other `package.json` `exports`) are the preferred workspace-internal import surface for API, web, CLI source, and tests.

When adding a shared module, add the granular subpath to `package.json` `exports` and re-export that same source module from `src/index.ts`. The `src/index.test.ts` sync check fails if a package subpath export is missing from the root barrel.
