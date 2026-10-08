import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allIds, getSpecies, megaStoneBase, regulations, type Regulation } from '../data/index.js';
import { getLearnset } from '../data/learnsets.js';
import {
	emptyPlayer,
	emptyStatPoints,
	type Member,
	type Player,
	type Team
} from '../model/types.js';
import {
	hasErrors,
	isValidDob,
	validate,
	validatePlayer,
	validateTeam,
	type Issue
} from './index.js';

const legalPlayer: Player = {
	...emptyPlayer(),
	name: 'Ash Ketchum',
	playerId: '1234567',
	dob: '31/12/2000',
	division: 'masters',
	supportId: 'ABC123'
};

/** Builds a fully legal team from a regulation's own data. */
function legalTeam(reg: Regulation): Team {
	const items = reg.items.filter((i) => !megaStoneBase(i));
	const members: Member[] = [];
	const dexNums = new Set<number>();
	for (const id of reg.species) {
		const s = getSpecies(id)!;
		const ability = s.abilities.find((a) => reg.abilities.includes(a));
		const moves = getLearnset(reg.id, id).slice(0, 4);
		if (dexNums.has(s.num) || !ability || moves.length < 4) continue;
		dexNums.add(s.num);
		members.push({
			speciesId: id,
			abilityId: ability,
			itemId: items[members.length],
			natureId: 'adamant',
			moveIds: moves,
			sp: { ...emptyStatPoints(), hp: 32, atk: 32, spe: 2 }
		});
		if (members.length === reg.rules.teamSize) break;
	}
	return { id: 't', name: 'legal', regulationId: reg.id, members, updatedAt: 0 };
}

const clone = <T>(v: T): T => structuredClone(v);
const errorsOf = (issues: Issue[]) => issues.filter((i) => i.level === 'error');
const keys = (issues: Issue[]) => issues.map((i) => `${i.path}:${i.messageKey}`);

describe('fixtures', () => {
	it('Sahil sample is fully legal in the current regulation', () => {
		const members = JSON.parse(readFileSync('tests/fixtures/sahil.members.json', 'utf8'));
		const team: Team = { id: 's', name: '', regulationId: 'm-c', members, updatedAt: 0 };
		expect(validate(team, legalPlayer)).toEqual([]);
	});
});

describe.each(regulations.map((r) => [r.id, r] as const))('rules for regulation %s', (_id, reg) => {
	const legal = legalTeam(reg);

	it('a fully legal team has zero issues', () => {
		expect(legal.members).toHaveLength(reg.rules.teamSize);
		expect(validateTeam(legal)).toEqual([]);
	});

	const mutate = (fn: (t: Team) => void) => {
		const t = clone(legal);
		fn(t);
		return validateTeam(t);
	};

	it('unknown regulation', () => {
		expect(keys(validateTeam({ ...legal, regulationId: 'nope' }))).toEqual([
			'regulationId:team.unknownRegulation'
		]);
	});

	it('fewer than 6 members', () => {
		expect(keys(mutate((t) => t.members.pop()))).toEqual(['members:team.tooFewMembers']);
	});

	it('more than 6 members', () => {
		const issues = mutate((t) => t.members.push(clone(t.members[0])));
		expect(keys(errorsOf(issues))).toContain('members:team.tooManyMembers');
	});

	it('unknown species', () => {
		expect(keys(mutate((t) => (t.members[0].speciesId = 'notamon')))).toEqual([
			'members.0.speciesId:member.speciesUnknown'
		]);
	});

	// M-C is cumulative, so every dex species is legal there; only older regulations have illegal ones.
	const illegalSpecies = allIds('species').find((id) => !reg.species.includes(id));
	it.skipIf(!illegalSpecies)('species illegal in regulation', () => {
		const issues = mutate((t) => (t.members[0].speciesId = illegalSpecies!));
		expect(keys(issues)).toContain('members.0.speciesId:member.speciesIllegal');
		expect(hasErrors(issues)).toBe(true);
	});

	it('ability not available to the species', () => {
		const wrong = reg.abilities.find(
			(a) => !getSpecies(legal.members[0].speciesId)!.abilities.includes(a)
		)!;
		expect(keys(mutate((t) => (t.members[0].abilityId = wrong)))).toEqual([
			'members.0.abilityId:member.abilityIllegal'
		]);
	});

	it('move the species cannot learn', () => {
		const learnable = new Set(getLearnset(reg.id, legal.members[0].speciesId));
		const bad = reg.moves.find((m) => !learnable.has(m))!;
		expect(keys(mutate((t) => (t.members[0].moveIds[3] = bad)))).toEqual([
			'members.0.moveIds.3:member.moveNotLearnable'
		]);
	});

	it('duplicate move', () => {
		expect(keys(mutate((t) => (t.members[1].moveIds[2] = t.members[1].moveIds[0])))).toEqual([
			'members.1.moveIds.2:member.moveDuplicate'
		]);
	});

	it('SP 33 in one stat', () => {
		expect(
			keys(
				errorsOf(
					mutate((t) => {
						t.members[0].sp = { ...emptyStatPoints(), hp: 33, atk: 31 };
					})
				)
			)
		).toEqual(['members.0.sp.hp:member.spOutOfRange']);
	});

	it('SP total 67', () => {
		expect(
			keys(
				mutate((t) => {
					t.members[0].sp = { ...emptyStatPoints(), hp: 32, atk: 32, spe: 3 };
				})
			)
		).toEqual(['members.0.sp:member.spTotalExceeded']);
	});

	it('SP total under 66 is only a warning', () => {
		const issues = mutate((t) => (t.members[0].sp = emptyStatPoints()));
		expect(keys(issues)).toEqual(['members.0.sp:member.spUnspent']);
		expect(hasErrors(issues)).toBe(false);
	});

	it('species clause (same dex number, e.g. a duplicate)', () => {
		expect(keys(mutate((t) => (t.members[3].speciesId = t.members[0].speciesId)))).toContain(
			'members.3.speciesId:member.speciesDuplicate'
		);
	});

	it('item clause', () => {
		expect(keys(mutate((t) => (t.members[4].itemId = t.members[1].itemId)))).toEqual([
			'members.4.itemId:member.itemDuplicate'
		]);
	});

	it('mega stone for another species', () => {
		const stone = reg.items.find(
			(i) => megaStoneBase(i) && megaStoneBase(i) !== legal.members[0].speciesId
		)!;
		expect(keys(mutate((t) => (t.members[0].itemId = stone)))).toEqual([
			'members.0.itemId:member.itemMegaMismatch'
		]);
	});

	it('item not in regulation / unknown item / missing item', () => {
		expect(keys(mutate((t) => (t.members[0].itemId = 'notanitem')))).toEqual([
			'members.0.itemId:member.itemUnknown'
		]);
		const issues = mutate((t) => (t.members[0].itemId = ''));
		expect(keys(issues)).toEqual(['members.0.itemId:member.itemMissing']);
		expect(hasErrors(issues)).toBe(false);
	});

	it('missing or unknown nature', () => {
		expect(keys(mutate((t) => (t.members[0].natureId = '')))).toEqual([
			'members.0.natureId:member.natureMissing'
		]);
		expect(keys(mutate((t) => (t.members[0].natureId = 'grumpy')))).toEqual([
			'members.0.natureId:member.natureUnknown'
		]);
	});

	it('no moves is an error, fewer than 4 a warning', () => {
		expect(keys(mutate((t) => (t.members[0].moveIds = [])))).toEqual([
			'members.0:member.movesMissing'.replace('members.0', 'members.0.moveIds')
		]);
		const issues = mutate((t) => t.members[0].moveIds.pop());
		expect(keys(issues)).toEqual(['members.0.moveIds:member.movesFewer']);
		expect(hasErrors(issues)).toBe(false);
	});

	it('empty slot', () => {
		const issues = mutate((t) => {
			t.members[5] = { ...clone(t.members[5]), speciesId: '', abilityId: '' };
		});
		expect(keys(issues)).toEqual([
			'members.5.speciesId:member.speciesMissing',
			'members.5.abilityId:member.abilityMissing'
		]);
	});
});

describe('player', () => {
	it('legal player has no issues', () => {
		expect(validatePlayer(legalPlayer)).toEqual([]);
	});

	it('player info is optional: an empty player has no issues', () => {
		expect(validatePlayer(emptyPlayer())).toEqual([]);
		expect(hasErrors(validate(legalTeam(regulations[0]), emptyPlayer()))).toBe(false);
	});

	it('DOB must be a real DD/MM/YYYY date', () => {
		expect(isValidDob('29/02/2024')).toBe(true);
		for (const bad of ['29/02/2023', '2000-12-31', '1/1/2000', '31/13/2000', '00/01/2000'])
			expect(isValidDob(bad), bad).toBe(false);
		expect(keys(validatePlayer({ ...legalPlayer, dob: '12/31/2000' }))).toEqual([
			'player.dob:player.dobInvalid'
		]);
	});
});

describe('validate', () => {
	it('combines player and team issues; errors block, warnings do not', () => {
		const team = legalTeam(regulations[0]);
		expect(hasErrors(validate(team, legalPlayer))).toBe(false);
		expect(hasErrors(validate(team, { ...legalPlayer, dob: 'x' }))).toBe(true);
		team.members.pop();
		expect(hasErrors(validate(team, legalPlayer))).toBe(true);
	});
});
