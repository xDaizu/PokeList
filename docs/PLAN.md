# PokeListo — Pokémon Champions VGC Team Sheet Generator

Living plan. Tick milestones off in the **Status** list as they complete.

## Status
- [ ] M0 — Scaffold & deploy
- [x] M1 — Data pipeline
- [x] M2 — Stats & domain model
- [x] M3 — Paste import (Showdown + Pokepaste)
- [ ] M4 — Validation
- [ ] M5 — PDF renderer
- [ ] M6 — Builder UI & theming
- [ ] M7 — Persistence
- [ ] M8 — Polish & release
- [ ] M9 — (Deferred) Team‑code import

## Context
Players at Play! Pokémon VGC events must hand in the official 2‑page team list (`docs/play-pokemon-vg-team-list.pdf`, Champions format: Stat Alignment, Support ID, Stat Points, no Tera). Existing tools are either English‑only (teamsheet.gg) or dated/heavy (`D:\Projects\PokemonTeamListCreator`: vanilla JS, ~40 MB eager fonts, hand‑drawn jsPDF, English UI). **PokeListo** ("lista" + "listo") is a new static site that builds a team (paste / Pokepaste / manual), validates it against the selected Champions regulation, and outputs an A4 PDF that is visually near‑identical to the official template — fully in **English and Spanish** (UI, Pokémon data names, sheet labels, and Spanish paste input). Visual style: Pokémon Champions look from champions.karthikb.dev/replica, Pokémon cards from op.gg (screenshots in `docs/`).

## Agreed requirements
| Area | Decision |
|---|---|
| Game | Pokémon Champions only |
| Input | Showdown paste (EN **and** ES names), Pokepaste URL, manual builder with autocomplete. Champions team‑code import **deferred** (architecture leaves room; op.gg Team ID data is a candidate source) |
| Output | Recreated PDF (not filling the official file), **A4 only**, **one 2‑page PDF** (p1 Staff, p2 Opponents) |
| Staff stat boxes | **Stat Points** (0–32 each, 66 total, Lv50) |
| Megas | Sheet shows **base species** (e.g. "Salamence" + Salamencite) |
| DOB | Always **DD/MM/YYYY** |
| i18n | EN + ES for UI, data names, sheet labels, paste input |
| Validation | **Block PDF on errors**; current Champions regulation + regulation selector |
| Persistence | localStorage: player info + multiple saved teams (no share links) |
| Extras v1 | Sprites in builder (not on PDF), dark mode |
| Stack / host | SvelteKit + TypeScript, `adapter-static`, GitHub Pages |
| Branding | "PokeListo" text logo, own design; no Pokémon logos; "not affiliated" footer |

## Architecture

### Stack
- SvelteKit 2 + Svelte 5 + TS, `@sveltejs/adapter-static`, `paths.base` set for GH Pages (`/PokeList` unless custom domain).
- i18n: **Paraglide JS** (`messages/en.json`, `messages/es.json`), prerendered routes `/en/…` and `/es/…`; root redirects by `navigator.language`, choice remembered in localStorage.
- PDF: **pdf-lib + @pdf-lib/fontkit**, embedded subset of **Carlito** (OFL, metric‑compatible with Calibri used by the official template) Regular/Bold. Lazy‑loaded only when generating.
- Styling: Svelte scoped CSS + design tokens as CSS custom properties (light/dark), self‑hosted condensed font via `@fontsource` (e.g. Saira Semi Condensed — closest to Replica's look).
- Tests: Vitest (unit), Playwright (e2e). CI: GitHub Actions → build → deploy to Pages.

### Data pipeline — `scripts/build-data.ts` (run manually / in CI, output committed)
- Sources: Showdown data via `@pkmn/dex`/`@pkmn/data` (species, base stats, abilities, learnsets, items, moves, natures, Champions formats/regulation legality); EN/ES names from PokeAPI CSVs (`pokemon_species_names`, `move_names`, `item_names`, `ability_names`, `nature_names`; lang 9=en, 7=es).
- Gaps (Champions‑new items/megastones/moves lacking PokeAPI ES names) filled from `D:\Projects\PokemonTeamListCreator\Resources\*Es.js` tables, then `data/overrides/{en,es}.json` for manual fixes. Script fails loudly listing any entity without an ES name.
- Output to `src/lib/data/generated/`: `dex.json` (ids, base stats, types, abilities, megas → base species), `learnsets.json`, `regulations.json`, `names.en.json`, `names.es.json`, `aliases.json` (accent‑/case‑insensitive EN+ES name → id, for paste parsing & search).
- Sprites: script downloads Showdown home/menu sprites for regulation‑legal species + item icons → `static/sprites/*.webp`.

### Domain model — `src/lib/model/`
`Team { id, name, regulationId, members: Member[6], updatedAt }`, `Member { speciesId, abilityId, itemId, natureId, moveIds[4], sp: {hp,atk,def,spa,spd,spe} }`, `Player { name, trainerName, playerId, dob, division, switchProfile, supportId, battleTeam }`. All stored as **ids**; names resolved per language at render time (so switching language re‑localizes everything, including the PDF). `stats.ts`: Champions Lv50 calc (port of old repo `getChampionsStats()`: HP = base+75+SP; others = ⌊(base+20+SP)×nature⌋) for the builder cards.

### Paste I/O — `src/lib/paste/`
- `parse.ts`: tolerant Showdown‑format tokenizer (name/@item, `Ability:`, `X Nature`, `- move`), names resolved through `aliases.json` so EN and ES pastes both work; unknown names collected as errors with line numbers (never silent `undefined` like the old repo).
  - **Stat Points** come from the comment line `# Champions stat points: HP 2 / SpA 32 / Spe 32` (format from `docs/samples/Sahils-Charizard-Y-Gliscor-Team-showdown.txt`); omitted stats = 0. Fallback: a plain `EVs:` line is accepted only if every value ≤32 (treated as SP), otherwise an error asking for SP.
  - `# Champions mega preview: …` / `# Mega ability: …` lines are parsed as informational only (sheet shows base species + base ability, e.g. Charizard / Blaze / Charizardite Y). Other `#` comments and `Level:`/`IVs:`/`Tera Type:` lines are ignored.
- `pokepaste.ts`: fetch `https://pokepast.es/<id>/json` → parse. If CORS blocks it, show a clear message asking to paste the text (GH Pages can't proxy).
- Export back to paste: not in v1 scope.

### Validation — `src/lib/validate/`
Pure functions returning `{level:'error'|'warning', path, messageKey}`: name resolution, species legal in selected regulation, ability legal for species, moves in learnset & unique, SP ≤32 each & ≤66 total, species clause, item clause, 6 members, required player fields. **Generate PDF button disabled while any error exists**; errors listed and shown inline per field.

### PDF — `src/lib/pdf/`
- `layout.ts`: declarative A4 layout spec (mm) reproducing the official template proportions: header block (title, subtitle, instruction line, player fields with underlines, Age Division checkboxes, DOB `/ /` slots), 3×2 Pokémon boxes (thick border, rows: Pokémon, Stat Alignment, Ability, Held Item, Move 1–4; page 1 adds the HP/Atk/Def/Sp.Atk/Sp.Def/Speed column), footer "All Pokémon must be listed exactly…".
- `render.ts`: draws page 1 (Staff: incl. Player ID, DOB, Support ID, SP values) and page 2 (Opponents: no ID/DOB/Support/SP) from the same spec; labels from Paraglide in the active language; auto‑shrink font size for long values; filename `PokeListo-<playerId|team>.pdf`.

### UI — `src/routes/[lang]/`
- Shell: indigo top bar (~`#5A55C4`) with PokeListo wordmark + EN/ES switcher + theme toggle; light theme background = cream→gold gradient with subtle triangle‑mosaic pattern (own CSS/SVG); glassy indigo‑gradient panels, lavender inputs, white pill buttons (Replica). Dark theme = near‑black background with dark‑purple cards (op.gg).
- Sections: **Player info** form · **Import** (paste textarea / Pokepaste URL tabs) · **Team builder**: 6 op.gg‑style cards (sprite, species, ability, nature highlighted, item icon, 4 moves with type‑colored chips, stat bars showing final stat + SP with nature +/− coloring) each editable via autocomplete comboboxes (search EN+ES aliases) and SP steppers with live remaining‑points counter · **Saved teams** list (new/duplicate/rename/delete) · **Validation panel** · **Generate PDF**.
- Responsive (mobile single column), keyboard‑accessible comboboxes.

### Persistence — `src/lib/stores/`
Svelte 5 runes stores backed by localStorage (`pokelisto:v1:player`, `pokelisto:v1:teams`, `…:settings`), versioned schema, validated on load, every access in try/catch (works in private mode with no persistence).

## Milestones (each independently testable)
Rule: each milestone ships with its own tests and a "done when" check, and is tested in isolation via **fixtures** (`tests/fixtures/`: sample teams as id‑based JSON + EN/ES paste texts), never by going through a later milestone. Primary fixture: `docs/samples/Sahils-Charizard-Y-Gliscor-Team-showdown.txt` (Indeedee, Gliscor, Kingambit, Charizard‑Y, Annihilape, Venusaur) copied into `tests/fixtures/` together with its hand‑written expected `Team` JSON. Logic milestones (M2–M5) are pure TS modules with no UI dependency, so they can be built/tested in any order after M1. Each milestone = one PR to `main`, CI green, deployed.

**M0 — Scaffold & deploy**
- Scope: SvelteKit + TS + adapter‑static + Paraglide (EN/ES) + Vitest + Playwright + ESLint/Prettier; GH Actions (lint, test, build, deploy to Pages); placeholder page with PokeListo wordmark and EN/ES switch. (Repo has no commits and is on `master`; create `main` first.)
- Tests: Vitest smoke test; Playwright: `/en/` and `/es/` render translated heading, root redirects by browser language.
- Done when: live GH Pages URL shows the page in both languages under the base path.

**M1 — Data pipeline** ✅
- Implementation notes: Showdown's `champions`/`championsregmb` mods aren't in `@pkmn/*`, so `npm run data` fetches a pinned `smogon/pokemon-showdown` commit into `.cache/` and runs its real `Dex` via tsx. Regulations are cumulative (M-C ⊃ M-B ⊃ M-A, per Serebii); M-A has no Showdown mod, so only M-C (current) and M-B are generated. Sprites come from PokeAPI/sprites (pinned) converted to webp; Champions-new mega stones have no sprite yet (warning only). `resolveAlias(kind, text)` is per-kind. Overrides: `data/overrides/{en,es}.json` (`{kind: {id: name}}`).
- Scope: `scripts/build-data.ts` → `src/lib/data/generated/*` + sprites; typed loaders `getSpecies(id)`, `nameOf(kind, id, lang)`, `resolveAlias(text)`.
- Tests: every legal species/move/item/ability/nature has EN+ES names; `resolveAlias` resolves EN, ES, accent‑less and case variants (e.g. "Garchomp", "Rugido", "rugido"); megastones map to base species; known base stats spot‑checked; regulation list non‑empty.
- Done when: `npm run data` is reproducible (re‑run → no diff) and coverage tests pass.

**M2 — Stats & domain model**
- Scope: `model/` types + `stats.ts` (Champions Lv50 formula, nature ±).
- Tests: table tests against known values from op.gg screenshots (Pawmot Jolly 32 Atk → 167 Atk, 30 Spe → 170 Spe; Dragapult Jolly 32 HP → 195 HP).
- Done when: all stat fixtures match.

**M3 — Paste import (Showdown + Pokepaste)** ✅
- Implementation notes: `parseShowdown(text)` returns `{ members, errors }` (errors are `{line, code, value}`, codes map to i18n messages in M6); `toTeam(members)` wraps them. Accepts ES labels too (`Habilidad:`, `Naturaleza X`, `PS/Atq/AtqEsp/DefEsp/Vel` in the SP comment). `fetchPokepaste(urlOrId, fetch?)` returns `{ok, text}` or an error code (`invalidUrl|notFound|http|network`; a CORS block surfaces as `network`). Fixtures: `tests/fixtures/sahil.{en,es}.txt` + `sahil.members.json`.
- CORS: no real paste id was available without creating one, so only a 404 on `/json` was probed — it sends no `Access-Control-Allow-Origin`, so browser fetches from GH Pages will most likely fail and the UI must fall back to asking for pasted text. Re-check with a real paste in M6.
- Scope: `paste/parse.ts` (EN+ES), `paste/pokepaste.ts`.
- Tests: Sahil sample → exact expected `Team` JSON (SP from comment lines, e.g. Kingambit HP 32/Atk 1/Def 32/SpD 1; Charizard keeps Blaze + Charizardite Y); same team hand‑translated to ES paste → identical `Team`; `EVs:` fallback (≤32 accepted, 252 rejected); malformed/unknown names → errors with line numbers; Pokepaste fetch mocked (success, 404, CORS failure).
- Done when: all fixtures round‑trip to the expected model; one real pokepast.es URL checked manually (CORS result documented).

**M4 — Validation**
- Scope: `validate/` rules + regulation selection.
- Tests: one fixture per rule (illegal species, wrong ability, unlearnable move, duplicate move, SP 33 / total 67, species clause, item clause, <6 members, missing player fields) → exactly the expected error; a fully legal fixture → zero errors.
- Done when: rule suite passes for each regulation in `regulations.json`.

**M5 — PDF renderer**
- Scope: `pdf/layout.ts` + `pdf/render.ts`, takes `(Player, Team, lang)`; dev‑only route `/dev/pdf` renders the fixture team so it is reviewable without the builder.
- Tests: Vitest renders fixture → PDF has 2 A4 pages and its extracted text contains expected EN labels/values (and ES for `lang='es'`), SP on page 1 only, DOB `DD/MM/YYYY`, Mega shown as base species; long‑name fixture stays within box (auto‑shrink); snapshot PNG (pdf.js) compared with committed baseline.
- Done when: side‑by‑side with `docs/play-pokemon-vg-team-list.pdf` is approved (EN and ES).

**M6 — Builder UI & theming**
- Scope: app shell (Replica light theme, op.gg‑style dark theme), player form, import tabs (uses M3), 6 editable op.gg‑style cards with autocomplete + SP steppers (uses M1/M2), inline validation (uses M4), "Generate PDF" (uses M5, disabled on errors). State in memory only.
- Tests: Playwright: paste EN fixture → cards show correct names/stats → switch to ES → names re‑localize → download PDF; manual edit via autocomplete; illegal team → button disabled + errors shown; mobile viewport layout; theme toggle. Component tests for combobox keyboard navigation.
- Done when: full flow works on the deployed site in both languages and both themes.

**M7 — Persistence**
- Scope: localStorage stores for player info, saved teams list (new/duplicate/rename/delete/switch), settings (lang, theme).
- Tests: unit round‑trip + schema‑version migration + corrupted/missing storage falls back to defaults; storage access throwing (private mode) doesn't break the app; Playwright: save two teams, reload, switch between them, player info pre‑filled.
- Done when: data survives reload and the app still works with storage disabled.

**M8 — Polish & release**
- Scope: a11y pass (labels, focus, contrast), footer disclaimer, favicon/meta, performance (lazy‑load PDF lib + fonts, sprite sizes).
- Tests: Playwright + axe (no serious violations); Lighthouse ≥ 90 perf/a11y on deployed site.
- Done when: v1 tagged.

**M9 — (Deferred) Team‑code import**: investigate op.gg Team ID data; separate plan when picked up.

## To verify during implementation
- SP paste format: confirmed for the sample's exporter (`# Champions stat points:` comment). Still to check whether Showdown's own Champions export uses a different line.
- Extra fixtures that would help (optional, in `docs/samples/`): a paste with Spanish names, a pokepast.es link of a Champions team, a team with a Mega whose ability changes (e.g. Mega Salamence), and a deliberately illegal team.
- Whether pokepast.es `/json` allows CORS.
- Showdown/@pkmn coverage of Champions regulations & learnsets; PokeAPI ES coverage of Champions‑only items.
- Official Play! Pokémon guidance on Megas (decision: base species).

## Verification (end‑to‑end, after M8)
- `npm run test` (all unit suites from M1–M7) and `npm run test:e2e` green in CI.
- `npm run build && npm run preview` — static build works under the GH Pages base path.
- Generate a real team's PDF in EN and ES, print on A4, compare against the official template.
- Manual: light/dark, mobile width, language switch re‑localizes builder + PDF, saved teams survive reload.
