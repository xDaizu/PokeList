/**
 * Audits our Spanish (Spain) names against WikiDex, the Spanish Pokémon wiki, which tracks the
 * official in-game names. Pages are cached in `.cache/audit/`. Report: `.cache/audit/report.json`.
 * Run: npx tsx scripts/audit-es-names.ts
 *
 * WikiDex normalises capitalisation inconsistently (e.g. "Banda aguante" vs in-game "Banda Aguante"),
 * so case-only differences are reported separately and never counted as errors.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { normalize } from '../src/lib/data/normalize.ts';

const dir = '.cache/audit';
const GEN = `${import.meta.dirname}/../src/lib/data/generated`;
const load = (f: string) => JSON.parse(readFileSync(`${GEN}/${f}`, 'utf8'));
const namesEn = load('names.en.json');
const namesEs = load('names.es.json');
const dex = load('dex.json');

const PAGES: Record<string, string> = {
	moves: 'Lista_de_movimientos',
	items: 'Lista_de_objetos',
	abilities: 'Lista_de_habilidades',
	natures: 'Naturaleza',
	species: 'Lista_de_Pok%C3%A9mon'
};

async function page(name: string): Promise<string> {
	mkdirSync(dir, { recursive: true });
	const file = `${dir}/${name}.html`;
	if (!existsSync(file)) {
		const res = await fetch(`https://www.wikidex.net/wiki/${name}`, {
			headers: { 'User-Agent': 'Mozilla/5.0 (PokeListo name audit)' }
		});
		if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
		writeFileSync(file, await res.text());
	}
	return keepSpain(readFileSync(file, 'utf8'));
}

/**
 * WikiDex marks region-specific names with es-419 / es-ES spans. They become `\uE001LATAM\uE003SPAIN\uE002`
 * so each row can yield both spellings (see `regional`).
 */
function keepSpain(html: string): string {
	return html.replace(
		/<span class="regional-lang-switch"><span lang="es-419">(.*?)<\/span><span class="divmarker">\/<\/span><span lang="es-ES">(.*?)<\/span><\/span>/gs,
		(_, latam: string, spain: string) =>
			`\uE001${latam.replace(/<[^>]+>/g, '')}\uE003${spain.replace(/<[^>]+>/g, '')}\uE002`
	);
}

/** Both spellings of a possibly region-switched name. */
function regional(text: string): { spain: string; latam: string } {
	const pick = (which: 1 | 2) =>
		decode(
			text.replace(/\uE001(.*?)\uE003(.*?)\uE002/gs, (_, l: string, s: string) =>
				which === 1 ? l : s
			)
		);
	return { spain: pick(2), latam: pick(1) };
}

/** normalised English -> Latin American spellings that differ from the Spain one. */
const latamRef = new Map<string, Set<string>>();

const decode = (s: string) =>
	s
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
		.replace(/&amp;/g, '&')
		.replace(/&nbsp;/g, ' ')
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.trim();

type Ref = Map<string, Set<string>>; // normalised English -> Spanish spellings on WikiDex
const add = (m: Ref, en: string, es: string) => {
	const k = normalize(decode(en));
	const { spain, latam } = regional(es);
	if (!m.has(k)) m.set(k, new Set());
	m.get(k)!.add(spain);
	if (latam !== spain) {
		if (!latamRef.has(k)) latamRef.set(k, new Set());
		latamRef.get(k)!.add(latam);
	}
};

/**
 * `<a>Español</a>[</b>][<sup>…</sup>]<br><i>English</i>` rows (moves and items). WikiDex writes
 * region-specific names with es-419 / es-ES spans (see `keepSpain`).
 */
function linkBreakItalic(html: string): Ref {
	const m: Ref = new Map();
	for (const r of html.matchAll(
		/<a [^>]*>([^<]+)<\/a>(?:<\/b>)?(?:<sup[^>]*>.*?<\/sup>)?<br\s*\/?><i>([^<]+)<\/i>/g
	)) {
		add(m, r[2], r[1]);
	}
	return m;
}

/** Abilities, row by row: Spain name, Latin American name, English (`<i>`) in that column order; keeps Spain. */
function abilities(html: string): Ref {
	const m: Ref = new Map();
	const text = (td: string) => td.replace(/<[^>]+>/g, '').trim();
	for (const row of html.matchAll(/<tr>(.*?)<\/tr>/gs)) {
		const cells = [...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((c) => c[1]);
		const at = cells.findIndex((c) => /^\s*<i>[^<]+<\/i>\s*$/.test(c));
		if (at < 2) continue;
		const es = text(cells[at - 2]);
		add(m, text(cells[at]), es);
		const ha = text(cells[at - 1]);
		if (ha && regional(ha).spain !== regional(es).spain)
			add(m, text(cells[at]), `\uE001${ha}\uE003${es}\uE002`);
	}
	return m;
}

/** Natures: `Firme</…>(Adamant)` cells. */
function natures(html: string): Ref {
	const m: Ref = new Map();
	for (const r of html.matchAll(/<b>([^<]+)<\/b>\s*(?:<[^>]+>\s*)*\(([A-Za-z]+)\)/g))
		add(m, r[2], r[1]);
	for (const r of html.matchAll(
		/>([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)<[^>]*>\s*(?:<[^>]+>\s*)*\(([A-Z][a-z]+)\)/g
	)) {
		add(m, r[2], r[1]);
	}
	return m;
}

/** Base species by National Dex number: `<td>0006 </td><td><a>Charizard</a>`. */
function speciesByNum(html: string): Map<number, Set<string>> {
	const m = new Map<number, Set<string>>();
	for (const r of html.matchAll(/<td[^>]*>(\d{4})\s*<\/td>\s*<td><a [^>]*>([^<]+)<\/a>/g)) {
		const n = Number(r[1]);
		if (!m.has(n)) m.set(n, new Set());
		m.get(n)!.add(decode(r[2]));
	}
	return m;
}

interface Row {
	kind: string;
	id: string;
	en: string;
	ours: string;
	wikidex: string[];
}
const report = {
	checked: {} as Record<string, number>,
	different: [] as Row[],
	caseOnly: [] as Row[],
	/** Ours equals the Latin American spelling while WikiDex lists a different Spain one. */
	latinAmerican: [] as Row[],
	notFound: [] as Row[]
};

function compare(kind: string, ref: Ref) {
	let checked = 0;
	for (const [id, en] of Object.entries<string>(namesEn[kind])) {
		const ours: string = namesEs[kind][id];
		const found = ref.get(normalize(en));
		const row = { kind, id, en, ours, wikidex: [...(found ?? [])] };
		if (!found) report.notFound.push(row);
		else {
			checked++;
			const lower = (s: string) => s.normalize('NFC').toLowerCase();
			if (row.wikidex.includes(ours)) continue;
			if (latamRef.get(normalize(en))?.has(ours)) {
				report.latinAmerican.push(row);
				continue;
			}
			if (row.wikidex.some((w) => lower(w) === lower(ours))) report.caseOnly.push(row);
			else report.different.push(row);
		}
	}
	report.checked[kind] = checked;
}

compare('moves', linkBreakItalic(await page(PAGES.moves)));
compare('items', linkBreakItalic(await page(PAGES.items)));
compare('abilities', abilities(await page(PAGES.abilities)));
compare('natures', natures(await page(PAGES.natures)));

// Latin American spellings (and any other region-switched variants) become extra accepted input names.
const aliasFile: Record<string, Record<string, string[]>> = {};
for (const kind of ['moves', 'items', 'abilities', 'natures']) {
	aliasFile[kind] = {};
	for (const [id, en] of Object.entries<string>(namesEn[kind]).sort(([a], [b]) =>
		a < b ? -1 : 1
	)) {
		const extra = [...(latamRef.get(normalize(en)) ?? [])].filter(
			(name) => normalize(name) !== normalize(namesEs[kind][id])
		);
		if (extra.length) aliasFile[kind][id] = extra.sort();
	}
}
writeFileSync(
	`${import.meta.dirname}/../data/es-aliases.wikidex.json`,
	JSON.stringify(aliasFile, null, '\t') + '\n'
);

// Species: base forms by dex number; other forms are listed for manual review.
const bySpecies = speciesByNum(await page(PAGES.species));
let speciesChecked = 0;
for (const [id, en] of Object.entries<string>(namesEn.species)) {
	const sp = dex.species[id];
	const ours: string = namesEs.species[id];
	const isBase = !sp.baseSpecies || sp.baseSpecies === id;
	const found = [...(bySpecies.get(sp.num) ?? [])];
	const row = { kind: 'species', id, en, ours, wikidex: found };
	if (!isBase) continue;
	if (!found.length) report.notFound.push(row);
	else {
		speciesChecked++;
		if (!found.includes(ours)) report.different.push(row);
	}
}
report.checked.species = speciesChecked;

writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 1) + '\n');
const sizes = Object.fromEntries(
	Object.keys(namesEn).map((k) => [k, Object.keys(namesEn[k]).length])
);
console.log('ours:', sizes);
console.log('matched on WikiDex:', report.checked);
console.log(
	`latin-american: ${report.latinAmerican.length}, different: ${report.different.length}, case-only: ${report.caseOnly.length}, not found: ${report.notFound.length}`
);
for (const r of report.latinAmerican)
	console.log('LATAM', r.kind, r.en, '| ours:', r.ours, '| spain:', r.wikidex.join(' / '));
for (const r of report.different)
	console.log('DIFF', r.kind, r.en, '| ours:', r.ours, '| wikidex:', r.wikidex.join(' / '));
