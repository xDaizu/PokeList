import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentRegulation } from '../data/index.js';
import { parseShowdown, toTeam } from './parse.js';
import { fetchPokepaste, parsePokepasteId } from './pokepaste.js';

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');
const expected = JSON.parse(fixture('sahil.members.json'));

describe('parseShowdown', () => {
	it('parses the Sahil sample (EN) to the expected members', () => {
		const { members, errors } = parseShowdown(fixture('sahil.en.txt'));
		expect(errors).toEqual([]);
		expect(members).toEqual(expected);
	});

	it('parses the same team in Spanish identically', () => {
		const { members, errors } = parseShowdown(fixture('sahil.es.txt'));
		expect(errors).toEqual([]);
		expect(members).toEqual(expected);
	});

	it('keeps base species, base ability and mega stone for Charizard-Y', () => {
		const charizard = parseShowdown(fixture('sahil.en.txt')).members[3];
		expect(charizard).toMatchObject({
			speciesId: 'charizard',
			abilityId: 'blaze',
			itemId: 'charizarditey'
		});
	});

	it('handles CRLF, BOM, nicknames and gender tags', () => {
		const text =
			'﻿Boss (Garchomp) (M) @ Life Orb\r\nAbility: Rough Skin\r\nJolly Nature\r\n- Protect\r\n';
		const { members, errors } = parseShowdown(text);
		expect(errors).toEqual([]);
		expect(members[0]).toMatchObject({
			speciesId: 'garchomp',
			itemId: 'lifeorb',
			natureId: 'jolly',
			moveIds: ['protect']
		});
	});

	it('ignores Level / IVs / Tera Type lines and other comments', () => {
		const text =
			'Garchomp @ Life Orb\nLevel: 50\nTera Type: Fire\nIVs: 0 Atk\n# note\nJolly Nature\n- Protect';
		expect(parseShowdown(text).errors).toEqual([]);
	});

	describe('EVs fallback', () => {
		it('accepts EVs that are all ≤ 32 as stat points', () => {
			const { members, errors } = parseShowdown('Garchomp\nEVs: 32 Atk / 2 HP / 32 Spe');
			expect(errors).toEqual([]);
			expect(members[0].sp).toEqual({ hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 });
		});
		it('rejects real EV spreads', () => {
			const { members, errors } = parseShowdown('Garchomp\nEVs: 252 Atk / 4 HP / 252 Spe');
			expect(errors).toEqual([
				{ line: 2, code: 'evsNotStatPoints', value: 'EVs: 252 Atk / 4 HP / 252 Spe' }
			]);
			expect(members[0].sp.atk).toBe(0);
		});
		it('prefers the stat points comment over EVs', () => {
			const { members, errors } = parseShowdown(
				'Garchomp\nEVs: 252 Atk\n# Champions stat points: Atk 5'
			);
			expect(errors).toEqual([]);
			expect(members[0].sp.atk).toBe(5);
		});
	});

	describe('errors', () => {
		it('reports unknown names with line numbers', () => {
			const text = [
				'Garchomp @ Nonsense Item', // 1
				'Ability: Fake Ability', // 2
				'Silly Nature', // 3
				'- Protect', // 4
				'- Not A Move', // 5
				'',
				'Fakemon @ Life Orb' // 7
			].join('\n');
			const { errors } = parseShowdown(text);
			expect(errors).toEqual([
				{ line: 1, code: 'unknownItem', value: 'Nonsense Item' },
				{ line: 2, code: 'unknownAbility', value: 'Fake Ability' },
				{ line: 3, code: 'unknownNature', value: 'Silly' },
				{ line: 5, code: 'unknownMove', value: 'Not A Move' },
				{ line: 7, code: 'unknownSpecies', value: 'Fakemon' }
			]);
		});

		it('reports malformed stat point comments', () => {
			const { errors } = parseShowdown('Garchomp\n# Champions stat points: Foo 3 / Atk\n');
			expect(errors.map((e) => [e.line, e.code])).toEqual([
				[2, 'unknownStat'],
				[2, 'badStatPoints']
			]);
		});

		it('reports unrecognized lines, extra moves and extra members', () => {
			const five = '- Protect\n- Surf\n- Earthquake\n- Rock Slide\n- Ice Beam';
			const { errors, members } = parseShowdown(`Garchomp\nwhat is this\n${five}`);
			expect(errors.map((e) => e.code)).toEqual(['unrecognizedLine', 'tooManyMoves']);
			expect(members[0].moveIds).toHaveLength(4);

			const seven = Array.from({ length: 7 }, () => 'Garchomp').join('\n\n');
			const r = parseShowdown(seven);
			expect(r.members).toHaveLength(6);
			expect(r.errors).toEqual([{ line: 13, code: 'tooManyMembers', value: 'Garchomp' }]);
		});

		it('returns nothing for empty input', () => {
			expect(parseShowdown('  \n')).toEqual({ members: [], errors: [] });
		});
	});
});

describe('toTeam', () => {
	it('wraps members using the current regulation by default', () => {
		const team = toTeam(expected, { id: 't1', name: 'Sahil' });
		expect(team).toMatchObject({
			id: 't1',
			name: 'Sahil',
			regulationId: getCurrentRegulation().id
		});
		expect(team.members).toHaveLength(6);
	});
});

describe('parsePokepasteId', () => {
	it.each([
		['https://pokepast.es/abc123def4567890', 'abc123def4567890'],
		['pokepast.es/abc123def4567890/', 'abc123def4567890'],
		['https://pokepast.es/abc123def4567890/json', 'abc123def4567890'],
		['abc123def4567890', 'abc123def4567890']
	])('%s', (input, id) => expect(parsePokepasteId(input)).toBe(id));

	it('rejects other input', () => {
		expect(parsePokepasteId('https://example.com/abc123def4567890')).toBeUndefined();
		expect(parsePokepasteId('hello')).toBeUndefined();
	});
});

describe('fetchPokepaste', () => {
	const url = 'https://pokepast.es/abc123def4567890';
	const json = (body: unknown, status = 200) =>
		vi.fn(async () => new Response(JSON.stringify(body), { status }));

	it('returns the paste text', async () => {
		const f = json({ title: 'My team', paste: 'Garchomp' });
		expect(await fetchPokepaste(url, f)).toEqual({
			ok: true,
			id: 'abc123def4567890',
			title: 'My team',
			text: 'Garchomp'
		});
		expect(f).toHaveBeenCalledWith('https://pokepast.es/abc123def4567890/json');
	});
	it('maps 404 to notFound', async () => {
		expect(await fetchPokepaste(url, json({}, 404))).toEqual({ ok: false, code: 'notFound' });
	});
	it('maps other statuses and bad bodies to http', async () => {
		expect(await fetchPokepaste(url, json({}, 500))).toEqual({ ok: false, code: 'http' });
		expect(await fetchPokepaste(url, json({ nope: 1 }))).toEqual({ ok: false, code: 'http' });
	});
	it('maps a CORS/network failure to network', async () => {
		const f = vi.fn(async () => {
			throw new TypeError('Failed to fetch');
		});
		expect(await fetchPokepaste(url, f)).toEqual({ ok: false, code: 'network' });
	});
	it('rejects invalid urls without fetching', async () => {
		const f = json({});
		expect(await fetchPokepaste('nope', f)).toEqual({ ok: false, code: 'invalidUrl' });
		expect(f).not.toHaveBeenCalled();
	});
});
