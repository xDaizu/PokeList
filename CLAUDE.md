# PokeListo

Static SvelteKit site that builds Pokémon Champions VGC team sheets (EN/ES). The plan and milestones live in @docs/PLAN.md — work one milestone at a time and tick it off there when done.

## Svelte conventions

@docs/svelte-rules.md

## Project notes

- This project uses SvelteKit 3: kit options (adapter, `paths.base`, prerender) are passed to `sveltekit()` in `vite.config.ts`; there is no `svelte.config.js` and no `base` export from `$app/paths` (use `resolve('/')`).
- i18n is Paraglide (`messages/{en,es}.json`, URL strategy `/en/…`, `/es/…`). Add every user-facing string to both files. `localizeHref` output already includes the base path, so don't wrap it in `resolve()`.
- `BASE_PATH=/PokeList` builds/tests under the GitHub Pages base path (CI does this).
- Before finishing a task run `npm run lint`, `npm run check`, `npm run test:unit -- --run`, and `npm run test:e2e` when routes/UI changed.
- Commits: single-line messages, no trailers.
