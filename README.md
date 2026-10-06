# PokeListo

Pokémon Champions VGC team sheet generator (EN/ES). See [docs/PLAN.md](docs/PLAN.md).

## Development

```sh
npm install
npm run dev          # dev server
npm run lint         # prettier + eslint
npm run check        # svelte-check
npm run test:unit -- --run
npx playwright install chromium && npm run test:e2e
```

Set `BASE_PATH=/PokeList` to build/test under the GitHub Pages base path (CI does this).
