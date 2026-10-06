import { describe, expect, it } from 'vitest';
import {
	allIds,
	getCurrentRegulation,
	getRegulation,
	getSpecies,
	megaStoneBase,
	nameOf,
	regulations,
	resolveAlias,
	type Kind,
	type Lang
} from './index.js';
import { getLearnset } from './learnsets.js';

const kinds: Kind[] = ['species', 'moves', 'items', 'abilities', 'natures'];
const langs: Lang[] = ['en', 'es'];

describe('names', () => {
	for (const kind of kinds)
		for (const lang of langs)
			it(`every ${kind} has a ${lang} name`, () => {
				const ids = allIds(kind);
				expect(ids.length).toBeGreaterThan(0);
				for (const id of ids) expect(nameOf(kind, id, lang), `${kind}/${id}`).not.toBe(id);
			});

	it('every regulation entity has names', () => {
		for (const reg of regulations)
			for (const [kind, ids] of [
				['species', reg.species],
				['items', reg.items],
				['abilities', reg.abilities],
				['moves', reg.moves]
			] as const)
				for (const id of ids) {
					expect(nameOf(kind, id, 'en'), `${reg.id} ${kind}/${id}`).not.toBe(id);
					expect(nameOf(kind, id, 'es'), `${reg.id} ${kind}/${id}`).not.toBe(id);
				}
	});

	it('resolves localized names', () => {
		expect(nameOf('species', 'garchomp', 'es')).toBe('Garchomp');
		expect(nameOf('moves', 'protect', 'es')).toBe('Protección');
		expect(nameOf('natures', 'jolly', 'es')).toBe('Alegre');
	});
});

describe('resolveAlias', () => {
	it('resolves EN, ES, accent-less and case variants', () => {
		expect(resolveAlias('species', 'Garchomp')).toBe('garchomp');
		expect(resolveAlias('moves', 'Rugido')).toBe('roar');
		expect(resolveAlias('moves', 'rugido')).toBe('roar');
		expect(resolveAlias('moves', 'PROTECCION')).toBe('protect');
		expect(resolveAlias('moves', 'Protección')).toBe('protect');
		expect(resolveAlias('natures', 'alegre')).toBe('jolly');
		expect(resolveAlias('abilities', 'Psychic Surge')).toBe('psychicsurge');
		expect(resolveAlias('items', 'Focus Sash')).toBe('focussash');
	});

	it('returns undefined for unknown names', () => {
		expect(resolveAlias('species', 'Notamon')).toBeUndefined();
	});

	it('resolves mega species names to their base species', () => {
		expect(resolveAlias('species', 'Charizard-Mega-Y')).toBe('charizard');
		expect(resolveAlias('species', 'Mega-Charizard Y')).toBe('charizard');
	});

	it('resolves regional forms in both languages', () => {
		expect(resolveAlias('species', 'Rotom-Wash')).toBe('rotomwash');
		expect(resolveAlias('species', 'Rotom Lavado')).toBe('rotomwash');
		expect(resolveAlias('species', 'Ninetales-Alola')).toBe('ninetalesalola');
	});
});

describe('dex', () => {
	it('maps mega stones to base species', () => {
		expect(megaStoneBase('charizarditey')).toBe('charizard');
		expect(megaStoneBase('salamencite')).toBe('salamence');
		expect(megaStoneBase('focussash')).toBeUndefined();
	});

	it('has spot-checked base stats', () => {
		expect(getSpecies('garchomp')?.baseStats).toEqual({
			hp: 108,
			atk: 130,
			def: 95,
			spa: 80,
			spd: 85,
			spe: 102
		});
		expect(getSpecies('charizard')?.baseStats.spa).toBe(109);
		expect(getSpecies('pawmot')?.baseStats.atk).toBe(115);
		expect(getSpecies('kingambit')?.abilities).toContain('defiant');
	});
});

describe('regulations', () => {
	it('is non-empty with exactly one current regulation', () => {
		expect(regulations.length).toBeGreaterThan(0);
		expect(regulations.filter((r) => r.current)).toHaveLength(1);
		expect(getCurrentRegulation().id).toBe('m-c');
	});

	it('builds M-C on top of M-B', () => {
		const b = getRegulation('m-b')!;
		const c = getRegulation('m-c')!;
		for (const kind of ['species', 'items', 'abilities', 'moves'] as const)
			for (const id of b[kind]) expect(c[kind], `${kind}/${id}`).toContain(id);
		expect(b.species).not.toContain('salamence');
		expect(c.species).toContain('salamence');
		expect(c.items).toContain('rockyhelmet');
		expect(b.items).not.toContain('rockyhelmet');
	});

	it('has a learnset for every legal species, within the legal moves', () => {
		for (const reg of regulations)
			for (const id of reg.species) {
				const moves = getLearnset(reg.id, id);
				expect(moves.length, `${reg.id}/${id}`).toBeGreaterThan(0);
				for (const m of moves) expect(reg.moves).toContain(m);
			}
	});

	it('knows the sample team moves', () => {
		expect(getLearnset('m-c', 'indeedee')).toEqual(
			expect.arrayContaining(['expandingforce', 'protect', 'imprison', 'trickroom'])
		);
	});
});
