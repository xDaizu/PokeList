/* eslint-disable @typescript-eslint/no-explicit-any -- Showdown's sim is loaded dynamically and untyped */
/**
 * Data pipeline: Showdown (Champions mods) + PokeAPI names -> src/lib/data/generated/*.
 * Run with `npm run data`. Sources are pinned to commit SHAs so re-runs are reproducible.
 * Downloads are cached in `.cache/` (gitignored).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { normalize } from '../src/lib/data/normalize.ts';

const SHOWDOWN_SHA = '14546894d86f9589ac11130c510bbe73b6968665';
const POKEAPI_SHA = '2ee1c422ad9f3831245dab0ac2a5cd1aae61cd72';
const SPRITES_SHA = '8491ffde1b247e4de574d4bb8e24b7bd9fa876fa';
const OLD_REPO = process.env.OLD_REPO ?? 'D:/Projects/PokemonTeamListCreator/Resources';
const FORMAT_RE = /^\[Gen 9 Champions\] VGC 2026 Reg (M-\w)$/;
const ES = 7;

const root = resolve(import.meta.dirname, '..');
const cache = join(root, '.cache');
const out = join(root, 'src/lib/data/generated');

type Kind = 'species' | 'moves' | 'items' | 'abilities' | 'natures';
const KINDS: Kind[] = ['species', 'moves', 'items', 'abilities', 'natures'];
type Names = Record<Kind, Record<string, string>>;
const emptyNames = (): Names => ({ species: {}, moves: {}, items: {}, abilities: {}, natures: {} });

// ---------------------------------------------------------------- sources

function ensureShowdown(): string {
	const dir = join(cache, 'showdown');
	const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
	const head = () => {
		try {
			return git('rev-parse', 'HEAD').toString().trim();
		} catch {
			return '';
		}
	};
	if (head() !== SHOWDOWN_SHA) {
		console.log(`Fetching Showdown @ ${SHOWDOWN_SHA.slice(0, 8)}…`);
		mkdirSync(dir, { recursive: true });
		if (!existsSync(join(dir, '.git'))) git('init', '-q');
		git(
			'fetch',
			'-q',
			'--depth',
			'1',
			'https://github.com/smogon/pokemon-showdown.git',
			SHOWDOWN_SHA
		);
		git('checkout', '-q', '-f', SHOWDOWN_SHA);
	}
	return dir;
}

async function download(url: string, file: string): Promise<boolean> {
	if (existsSync(file)) return true;
	const res = await fetch(url);
	if (!res.ok) return false;
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, Buffer.from(await res.arrayBuffer()));
	return true;
}

function parseCsvLine(line: string): string[] {
	const cells: string[] = [];
	let cur = '';
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (quoted) {
			if (c === '"' && line[i + 1] === '"') {
				cur += '"';
				i++;
			} else if (c === '"') quoted = false;
			else cur += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') {
			cells.push(cur);
			cur = '';
		} else cur += c;
	}
	cells.push(cur);
	return cells;
}

async function csv(name: string): Promise<Record<string, string>[]> {
	const file = join(cache, 'pokeapi', POKEAPI_SHA, `${name}.csv`);
	const url = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${POKEAPI_SHA}/data/v2/csv/${name}.csv`;
	if (!(await download(url, file))) throw new Error(`Could not download ${url}`);
	const [header, ...lines] = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
	const cols = parseCsvLine(header);
	return lines.map((l) => Object.fromEntries(parseCsvLine(l).map((v, i) => [cols[i], v])));
}

/** Old hand-made tables (var xEs = {...}) used as a fallback, matched by English name. */
function oldTable(dir: string, file: string, varName: string): Record<string, string> {
	const path = join(OLD_REPO, dir, file);
	if (!existsSync(path)) return {};
	return new Function(`${readFileSync(path, 'utf8')}; return ${varName};`)();
}
function oldByEnglish(dir: string, prefix: string): Map<string, string> {
	const en = oldTable(dir, `${prefix}En.js`, `${prefix.toLowerCase()}En`);
	const es = oldTable(dir, `${prefix}Es.js`, `${prefix.toLowerCase()}Es`);
	const map = new Map<string, string>();
	for (const [k, v] of Object.entries(en)) if (es[k]) map.set(normalize(v), es[k]);
	return map;
}

// ---------------------------------------------------------------- helpers

const sortObject = <T>(o: Record<string, T>): Record<string, T> =>
	Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

function writeJson(name: string, data: unknown) {
	mkdirSync(out, { recursive: true });
	writeFileSync(join(out, name), JSON.stringify(data, null, 1) + '\n');
}

const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Showdown id -> PokeAPI pokemon identifier (stripped) where they differ.
const SPECIES_ID_ALIASES: Record<string, string> = {
	taurospaldeacombat: 'taurospaldeacombatbreed',
	taurospaldeblaze: 'taurospaldeblazebreed',
	taurospaldeaaqua: 'taurospaldeaaquabreed',
	meowsticf: 'meowsticfemale',
	indeedeef: 'indeedeefemale',
	basculegionf: 'basculegionfemale',
	toxtricitylowkey: 'toxtricitylowkey',
	maushold: 'mausholdfamilyofthree',
	aegislash: 'aegislashshield',
	gourgeist: 'gourgeistaverage',
	lycanroc: 'lycanrocmidday',
	mimikyu: 'mimikyudisguised',
	toxtricity: 'toxtricityamped',
	indeedee: 'indeedeemale',
	morpeko: 'morpekofullbelly',
	basculegion: 'basculegionmale',
	squawkabilly: 'squawkabillygreenplumage',
	squawkabillyyellow: 'squawkabillyyellowplumage',
	squawkabillywhite: 'squawkabillywhiteplumage',
	palafin: 'palafinzero',
	taurospaldeablaze: 'taurospaldeablazebreed',
	pyroar: 'pyroarmale',
	meowstic: 'meowsticmale',
	mausholdfour: 'mausholdfamilyoffour'
};

// ---------------------------------------------------------------- main

async function main() {
	const showdownDir = ensureShowdown();
	const { Dex } = await import(pathToFileURL(join(showdownDir, 'sim/dex.ts')).href);
	const overrides = {
		en: JSON.parse(readFileSync(join(root, 'data/overrides/en.json'), 'utf8')) as Partial<Names>,
		es: JSON.parse(readFileSync(join(root, 'data/overrides/es.json'), 'utf8')) as Partial<Names>
	};

	// ---- regulations (one per Champions VGC format that exists in Showdown)
	const formats = (Dex.formats.all() as { name: string; mod: string }[])
		.map((f) => ({ f, m: FORMAT_RE.exec(f.name) }))
		.filter((x) => x.m);
	if (!formats.length) throw new Error('No Champions VGC formats found in Showdown');
	formats.sort((a, b) => (a.m![1] < b.m![1] ? 1 : -1)); // newest regulation first
	const latestMod = Dex.mod(formats[0].f.mod);

	const dexSpecies: Record<string, unknown> = {};
	const megas: Record<string, { name: string; base: string; stone: string }> = {};
	const cosmetic: Record<string, string> = {}; // cosmetic forme id -> base species id
	const dexMoves: Record<string, unknown> = {};
	const dexItems: Record<string, { mega?: string }> = {};
	const learnsets: Record<string, Record<string, string[]>> = {};
	const regulations: unknown[] = [];
	const enNames = emptyNames();
	const speciesNum: Record<string, number> = {};
	const speciesBase: Record<string, string> = {};

	for (const [index, { f, m }] of formats.entries()) {
		const mod = Dex.mod(f.mod);
		const rt = Dex.formats.getRuleTable(f);
		const regId = m![1].toLowerCase();

		const legalSpecies = mod.species
			.all()
			.filter((s: any) => !s.isNonstandard && !rt.isBannedSpecies(s));
		const legalMoves = mod.moves.all().filter((x: any) => !x.isNonstandard);
		const legalItems = mod.items.all().filter((x: any) => !x.isNonstandard);
		const legalAbilities = mod.abilities.all().filter((x: any) => !x.isNonstandard);
		const moveIds = new Set<string>(legalMoves.map((x: any) => x.id));

		const selectable: string[] = [];
		for (const s of legalSpecies) {
			const base = mod.species.get(s.baseSpecies);
			if (s.isMega || s.forme === 'Mega' || /-Mega/.test(s.name)) {
				const stone = legalItems.find((i: any) => i.megaStone?.[s.baseSpecies] === s.name);
				if (stone) megas[s.id] = { name: s.name, base: toId(s.baseSpecies), stone: stone.id };
				continue;
			}
			const sameAsBase =
				s.baseSpecies !== s.name &&
				JSON.stringify([s.baseStats, s.types, s.abilities]) ===
					JSON.stringify([base.baseStats, base.types, base.abilities]);
			if (
				s.battleOnly ||
				/-Tera$/.test(s.name) ||
				sameAsBase ||
				(base.cosmeticFormes ?? []).includes(s.name)
			) {
				if (!s.battleOnly && !/-Tera$/.test(s.name)) cosmetic[s.id] = toId(s.baseSpecies);
				continue;
			}
			selectable.push(s.id);
			if (index === 0 || !dexSpecies[s.id]) {
				dexSpecies[s.id] = {
					num: s.num,
					types: s.types,
					baseStats: s.baseStats,
					abilities: [...new Set(Object.values(s.abilities) as string[])].map(toId),
					...(s.baseSpecies !== s.name ? { baseSpecies: toId(s.baseSpecies) } : {})
				};
				enNames.species[s.id] = s.name;
				speciesNum[s.id] = s.num;
				speciesBase[s.id] = toId(s.baseSpecies);
			}
		}

		for (const s of legalSpecies) {
			if (!selectable.includes(s.id)) continue;
			const set = new Set<string>();
			const chain = [s];
			for (let p = s; p.prevo;) chain.push((p = mod.species.get(p.prevo)));
			if (s.baseSpecies !== s.name) chain.push(mod.species.get(s.baseSpecies));
			for (const c of chain) {
				const data = mod.species.getLearnsetData(c.id);
				for (const mv of Object.keys(data?.learnset ?? {})) if (moveIds.has(mv)) set.add(mv);
			}
			(learnsets[regId] ??= {})[s.id] = [...set].sort();
		}

		for (const mv of legalMoves) {
			enNames.moves[mv.id] = mv.name;
			dexMoves[mv.id] = { type: mv.type, category: mv.category, basePower: mv.basePower };
		}
		for (const it of legalItems) {
			enNames.items[it.id] = it.name;
			const baseName = it.megaStone && Object.keys(it.megaStone)[0];
			const mega = baseName ? toId(baseName) : undefined;
			dexItems[it.id] = mega ? { mega } : {};
		}
		// Only abilities a selectable species can have (mega-only abilities are informational).
		const usable = new Set(
			selectable.flatMap((id) => (dexSpecies[id] as { abilities: string[] }).abilities)
		);
		for (const ab of legalAbilities) if (usable.has(ab.id)) enNames.abilities[ab.id] = ab.name;

		regulations.push({
			id: regId,
			name: `VGC 2026 Reg ${m![1]}`,
			current: index === 0,
			rules: {
				teamSize: rt.maxTeamSize,
				bring: rt.pickedTeamSize ?? rt.maxTeamSize,
				level: rt.adjustLevel ?? rt.maxLevel,
				speciesClause: rt.has('speciesclause'),
				itemClause: rt.has('itemclause')
			},
			species: selectable.sort(),
			items: legalItems.map((x: any) => x.id).sort(),
			abilities: legalAbilities
				.map((x: any) => x.id)
				.filter((id: string) => usable.has(id))
				.sort(),
			moves: [...moveIds].sort()
		});
	}

	// Natures: all 25 (Showdown's own table).
	const dexNatures: Record<string, { plus?: string; minus?: string }> = {};
	for (const n of latestMod.natures.all()) {
		enNames.natures[n.id] = n.name;
		dexNatures[n.id] = {
			...(n.plus ? { plus: n.plus } : {}),
			...(n.minus ? { minus: n.minus } : {})
		};
	}

	// ---- Spanish names
	const esNames = emptyNames();
	const [
		spNames,
		mvNames,
		itNames,
		abNames,
		ntNames,
		pokemon,
		forms,
		formNames,
		items,
		moves,
		abilities,
		natures
	] = await Promise.all(
		[
			'pokemon_species_names',
			'move_names',
			'item_names',
			'ability_names',
			'nature_names',
			'pokemon',
			'pokemon_forms',
			'pokemon_form_names',
			'items',
			'moves',
			'abilities',
			'natures'
		].map(csv)
	);
	const namesByLang = (rows: Record<string, string>[], idCol: string, lang: number) =>
		new Map(rows.filter((r) => +r.local_language_id === lang).map((r) => [r[idCol], r.name]));
	const identifierIndex = (rows: Record<string, string>[]) =>
		new Map(rows.map((r) => [toId(r.identifier), r]));
	const old = {
		species: oldByEnglish('Pokes', 'Pokes'),
		moves: oldByEnglish('Moves', 'Moves'),
		items: oldByEnglish('Items', 'Items'),
		abilities: oldByEnglish('Abilities', 'Abilities'),
		natures: oldByEnglish('Natures', 'Natures')
	};
	const apiTables = {
		moves: { idx: identifierIndex(moves), es: namesByLang(mvNames, 'move_id', ES) },
		items: { idx: identifierIndex(items), es: namesByLang(itNames, 'item_id', ES) },
		abilities: { idx: identifierIndex(abilities), es: namesByLang(abNames, 'ability_id', ES) },
		natures: { idx: identifierIndex(natures), es: namesByLang(ntNames, 'nature_id', ES) }
	};
	const speciesEs = namesByLang(spNames, 'pokemon_species_id', ES);
	const pokemonIdx = identifierIndex(pokemon);
	const formsByPokemon = new Map<string, Record<string, string>[]>();
	for (const fr of forms)
		formsByPokemon.set(fr.pokemon_id, [...(formsByPokemon.get(fr.pokemon_id) ?? []), fr]);
	const formEs = new Map<string, string>(); // form_id -> {form_name|pokemon_name}
	const formEsFull = new Map<string, string>();
	for (const r of formNames) {
		if (+r.local_language_id !== ES) continue;
		if (r.pokemon_name) formEsFull.set(r.pokemon_form_id, r.pokemon_name);
		if (r.form_name) formEs.set(r.pokemon_form_id, r.form_name);
	}

	const spanishSpecies = (id: string): string | undefined => {
		const num = speciesNum[id];
		const baseEs = speciesEs.get(String(num));
		if (speciesBase[id] === id) return baseEs;
		const row = pokemonIdx.get(SPECIES_ID_ALIASES[id] ?? id);
		const form = row && formsByPokemon.get(row.id)?.[0];
		if (!form || !baseEs) return undefined;
		const full = formEsFull.get(form.id);
		if (full) return full;
		const part = formEs.get(form.id);
		if (!part) return undefined;
		if (normalize(part).startsWith(normalize(baseEs))) return part;
		return `${baseEs} ${part.replace(/^Forma de /, 'de ').replace(/^Forma /, '')}`;
	};
	const REGION_ES: Record<string, string> = {
		Alola: 'Alola',
		Galar: 'Galar',
		Hisui: 'Hisui',
		Paldea: 'Paldea'
	};
	const regionalSpanish = (id: string): string | undefined => {
		const m = /^(.+)-(Alola|Galar|Hisui|Paldea)$/.exec(enNames.species[id]);
		const baseEs = m && speciesEs.get(String(speciesNum[id]));
		return m && baseEs ? `${baseEs} de ${REGION_ES[m[2]]}` : undefined;
	};

	const missing: string[] = [];
	// Where each Spanish name came from, written to `.cache/es-provenance.json` for auditing.
	const provenance: Record<string, { en: string; es: string; source: string }> = {};
	for (const kind of KINDS) {
		for (const [id, en] of Object.entries(enNames[kind])) {
			let es: string | undefined = overrides.es[kind]?.[id];
			let source = 'override';
			if (!es && kind === 'species') {
				es = spanishSpecies(id);
				source = 'pokeapi';
				if (!es) {
					es = regionalSpanish(id);
					source = 'regional-fallback';
				}
			} else if (!es) {
				const t = apiTables[kind as Exclude<Kind, 'species'>];
				const row = t.idx.get(id);
				es = row && t.es.get(row.id);
				source = 'pokeapi';
			}
			if (!es) {
				es = old[kind].get(normalize(en));
				source = 'old-repo-table';
			}
			if (es) {
				esNames[kind][id] = es;
				provenance[`${kind}/${id}`] = { en, es, source };
			} else missing.push(`${kind}/${id} (${en})`);
		}
	}
	mkdirSync(cache, { recursive: true });
	writeFileSync(join(cache, 'es-provenance.json'), JSON.stringify(provenance, null, 1) + '\n');
	if (missing.length) {
		console.error(
			`\nMissing Spanish names (add to data/overrides/es.json):\n  ${missing.join('\n  ')}`
		);
		throw new Error(`${missing.length} entities without an ES name`);
	}
	for (const kind of KINDS)
		for (const [id, v] of Object.entries(overrides.en[kind] ?? {})) enNames[kind][id] = v;

	// ---- aliases (normalized EN + ES name -> id, per kind)
	const aliases: Record<Kind, Record<string, string>> = {
		species: {},
		moves: {},
		items: {},
		abilities: {},
		natures: {}
	};
	const addAlias = (kind: Kind, text: string, id: string) => {
		const key = normalize(text);
		const prev = aliases[kind][key];
		if (prev && prev !== id)
			throw new Error(`Alias collision in ${kind}: "${text}" -> ${prev} vs ${id}`);
		aliases[kind][key] = id;
	};
	for (const kind of KINDS)
		for (const id of Object.keys(enNames[kind])) {
			addAlias(kind, id, id);
			addAlias(kind, enNames[kind][id], id);
			addAlias(kind, esNames[kind][id], id);
		}
	// Superseded and Latin American Spanish names stay accepted as input (pastes from older games or
	// other regions). `es-aliases.json` is curated by hand and must not collide; the WikiDex file is
	// generated by `scripts/audit-es-names.ts`, so a name that is also another entity's name is skipped.
	const readAliases = (file: string) =>
		JSON.parse(readFileSync(join(root, file), 'utf8')) as Partial<
			Record<Kind, Record<string, string[]>>
		>;
	for (const kind of KINDS)
		for (const [id, texts] of Object.entries(
			readAliases('data/overrides/es-aliases.json')[kind] ?? {}
		))
			for (const text of texts) addAlias(kind, text, id);
	let skippedAliases = 0;
	for (const kind of KINDS)
		for (const [id, texts] of Object.entries(
			readAliases('data/es-aliases.wikidex.json')[kind] ?? {}
		))
			for (const text of texts) {
				const prev = aliases[kind][normalize(text)];
				if (prev && prev !== id) skippedAliases++;
				else addAlias(kind, text, id);
			}
	if (skippedAliases)
		console.log(`Skipped ${skippedAliases} WikiDex aliases that name another entity`);
	for (const mega of Object.values(megas)) {
		addAlias('species', mega.name, mega.base);
		const suffix = /-Mega(?:-(\w+))?$/.exec(mega.name)?.[1] ?? '';
		const baseEs = esNames.species[mega.base];
		if (baseEs) addAlias('species', `Mega-${baseEs}${suffix ? ' ' + suffix : ''}`, mega.base);
	}
	// Official English wording for regional and gendered forms ("Hisuian Arcanine", "Indeedee-Female").
	const DEMONYM: Record<string, string> = {
		Alola: 'Alolan',
		Galar: 'Galarian',
		Hisui: 'Hisuian',
		Paldea: 'Paldean'
	};
	for (const [id, en] of Object.entries(enNames.species)) {
		const regional = /^(.+)-(Alola|Galar|Hisui|Paldea)$/.exec(en);
		if (regional) addAlias('species', `${DEMONYM[regional[2]]} ${regional[1]}`, id);
		const gendered = /^(.+)-F$/.exec(en);
		if (gendered) addAlias('species', `${gendered[1]}-Female`, id);
	}
	for (const [id, base] of Object.entries(cosmetic)) addAlias('species', id, base);

	// ---- write
	const names = (n: Names) => Object.fromEntries(KINDS.map((k) => [k, sortObject(n[k])]));
	writeJson('dex.json', {
		species: sortObject(dexSpecies),
		megas: sortObject(megas),
		moves: sortObject(dexMoves),
		items: sortObject(dexItems),
		natures: sortObject(dexNatures)
	});
	writeJson('regulations.json', regulations);
	writeJson(
		'learnsets.json',
		Object.fromEntries(Object.entries(learnsets).map(([k, v]) => [k, sortObject(v)]))
	);
	writeJson('names.en.json', names(enNames));
	writeJson('names.es.json', names(esNames));
	writeJson('aliases.json', Object.fromEntries(KINDS.map((k) => [k, sortObject(aliases[k])])));

	await sprites(enNames, pokemonIdx, items);
	console.log(
		`Done: ${Object.keys(dexSpecies).length} species, ${Object.keys(dexMoves).length} moves, ${Object.keys(dexItems).length} items, ${Object.keys(enNames.abilities).length} abilities, ${regulations.length} regulations`
	);
}

// ---------------------------------------------------------------- sprites

async function sprites(
	enNames: Names,
	pokemonIdx: Map<string, Record<string, string>>,
	items: Record<string, string>[]
) {
	const itemIdx = new Map(items.map((r) => [toId(r.identifier), r]));
	const jobs: { url: string; cacheFile: string; dest: string; label: string }[] = [];
	const base = `https://raw.githubusercontent.com/PokeAPI/sprites/${SPRITES_SHA}/sprites`;
	for (const id of Object.keys(enNames.species)) {
		const row = pokemonIdx.get(SPECIES_ID_ALIASES[id] ?? id);
		if (!row) {
			console.warn(`no sprite source for species ${id}`);
			continue;
		}
		jobs.push({
			url: `${base}/pokemon/${row.id}.png`,
			cacheFile: join(cache, 'sprites/pokemon', `${row.id}.png`),
			dest: join(root, 'static/sprites/pokemon', `${id}.webp`),
			label: `species ${id}`
		});
	}
	for (const [id] of Object.entries(enNames.items)) {
		const row = itemIdx.get(id);
		if (!row) {
			console.warn(`no sprite source for item ${id}`);
			continue;
		}
		jobs.push({
			url: `${base}/items/${row.identifier}.png`,
			cacheFile: join(cache, 'sprites/items', `${row.identifier}.png`),
			dest: join(root, 'static/sprites/items', `${id}.webp`),
			label: `item ${id}`
		});
	}
	const missing: string[] = [];
	let next = 0;
	const worker = async () => {
		while (next < jobs.length) {
			const job = jobs[next++];
			if (!(await download(job.url, job.cacheFile))) {
				missing.push(job.label);
				continue;
			}
			mkdirSync(dirname(job.dest), { recursive: true });
			await sharp(job.cacheFile).webp({ quality: 85 }).toFile(job.dest);
		}
	};
	await Promise.all(Array.from({ length: 8 }, worker));
	if (missing.length) console.warn(`No sprite available for: ${missing.sort().join(', ')}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
