import { getLearnset } from '../data/learnsets.js';
import {
	allIds,
	getNature,
	getRegulation,
	getSpecies,
	megaStoneBase,
	type Regulation
} from '../data/index.js';
import {
	MAX_SP_PER_STAT,
	MAX_SP_TOTAL,
	MOVES_PER_MEMBER,
	STAT_KEYS,
	totalSp,
	type Member,
	type Player,
	type Team
} from '../model/types.js';

export type IssueLevel = 'error' | 'warning';

/** Keys the UI maps to localized messages (added with the validation panel in M6). */
export type IssueKey =
	| 'team.unknownRegulation'
	| 'team.tooFewMembers'
	| 'team.tooManyMembers'
	| 'member.speciesMissing'
	| 'member.speciesUnknown'
	| 'member.speciesIllegal'
	| 'member.speciesDuplicate'
	| 'member.abilityMissing'
	| 'member.abilityIllegal'
	| 'member.itemMissing'
	| 'member.itemUnknown'
	| 'member.itemIllegal'
	| 'member.itemDuplicate'
	| 'member.itemMegaMismatch'
	| 'member.natureMissing'
	| 'member.natureUnknown'
	| 'member.movesMissing'
	| 'member.movesFewer'
	| 'member.moveUnknown'
	| 'member.moveNotLearnable'
	| 'member.moveDuplicate'
	| 'member.spOutOfRange'
	| 'member.spTotalExceeded'
	| 'member.spUnspent'
	| 'player.nameMissing'
	| 'player.playerIdMissing'
	| 'player.dobMissing'
	| 'player.dobInvalid'
	| 'player.divisionMissing'
	| 'player.supportIdMissing';

export interface Issue {
	level: IssueLevel;
	/** Dotted path to the offending field, e.g. `members.2.moveIds.1` or `player.dob`. */
	path: string;
	messageKey: IssueKey;
	/** Raw ids/values for message interpolation (the UI localizes names). */
	params?: Record<string, string | number>;
}

const err = (path: string, messageKey: IssueKey, params?: Issue['params']): Issue => ({
	level: 'error',
	path,
	messageKey,
	params
});
const warn = (path: string, messageKey: IssueKey, params?: Issue['params']): Issue => ({
	level: 'warning',
	path,
	messageKey,
	params
});

const KNOWN_ITEMS = new Set(allIds('items'));
const KNOWN_MOVES = new Set(allIds('moves'));

function validateMember(m: Member, i: number, reg: Regulation): Issue[] {
	const out: Issue[] = [];
	const at = (field: string) => `members.${i}.${field}`;

	const species = m.speciesId ? getSpecies(m.speciesId) : undefined;
	if (!m.speciesId) out.push(err(at('speciesId'), 'member.speciesMissing'));
	else if (!species)
		out.push(err(at('speciesId'), 'member.speciesUnknown', { value: m.speciesId }));
	else if (!reg.species.includes(m.speciesId))
		out.push(err(at('speciesId'), 'member.speciesIllegal', { value: m.speciesId }));

	if (!m.abilityId) out.push(err(at('abilityId'), 'member.abilityMissing'));
	else if (
		species &&
		(!species.abilities.includes(m.abilityId) || !reg.abilities.includes(m.abilityId))
	)
		out.push(err(at('abilityId'), 'member.abilityIllegal', { value: m.abilityId }));

	if (!m.itemId) out.push(warn(at('itemId'), 'member.itemMissing'));
	else if (!KNOWN_ITEMS.has(m.itemId))
		out.push(err(at('itemId'), 'member.itemUnknown', { value: m.itemId }));
	else if (!reg.items.includes(m.itemId))
		out.push(err(at('itemId'), 'member.itemIllegal', { value: m.itemId }));
	else {
		const base = megaStoneBase(m.itemId);
		if (base && species && base !== (species.baseSpecies ?? species.id))
			out.push(err(at('itemId'), 'member.itemMegaMismatch', { value: m.itemId }));
	}

	if (!m.natureId) out.push(err(at('natureId'), 'member.natureMissing'));
	else if (!getNature(m.natureId))
		out.push(err(at('natureId'), 'member.natureUnknown', { value: m.natureId }));

	if (m.moveIds.length === 0) out.push(err(at('moveIds'), 'member.movesMissing'));
	else if (m.moveIds.length < MOVES_PER_MEMBER)
		out.push(warn(at('moveIds'), 'member.movesFewer', { count: m.moveIds.length }));
	const learnset = species ? new Set(getLearnset(reg.id, m.speciesId)) : undefined;
	const seen = new Set<string>();
	m.moveIds.forEach((id, j) => {
		const path = at(`moveIds.${j}`);
		if (!KNOWN_MOVES.has(id)) out.push(err(path, 'member.moveUnknown', { value: id }));
		else if (learnset && !learnset.has(id))
			out.push(err(path, 'member.moveNotLearnable', { value: id }));
		if (seen.has(id)) out.push(err(path, 'member.moveDuplicate', { value: id }));
		seen.add(id);
	});

	for (const k of STAT_KEYS) {
		const v = m.sp[k];
		if (!Number.isInteger(v) || v < 0 || v > MAX_SP_PER_STAT)
			out.push(
				err(at(`sp.${k}`), 'member.spOutOfRange', { stat: k, value: v, max: MAX_SP_PER_STAT })
			);
	}
	const total = totalSp(m.sp);
	if (total > MAX_SP_TOTAL)
		out.push(err(at('sp'), 'member.spTotalExceeded', { total, max: MAX_SP_TOTAL }));
	else if (total < MAX_SP_TOTAL)
		out.push(warn(at('sp'), 'member.spUnspent', { total, max: MAX_SP_TOTAL }));

	return out;
}

/** Validates a team against its selected regulation. Pure; never throws. */
export function validateTeam(team: Team): Issue[] {
	const reg = getRegulation(team.regulationId);
	if (!reg) return [err('regulationId', 'team.unknownRegulation', { value: team.regulationId })];

	const out: Issue[] = [];
	const size = reg.rules.teamSize;
	if (team.members.length < size)
		out.push(err('members', 'team.tooFewMembers', { count: team.members.length, need: size }));
	else if (team.members.length > size)
		out.push(err('members', 'team.tooManyMembers', { count: team.members.length, max: size }));

	team.members.forEach((m, i) => out.push(...validateMember(m, i, reg)));

	// Species clause is by Pokédex number, so forms of one Pokémon clash.
	if (reg.rules.speciesClause) {
		const dexNums = new Set<number>();
		team.members.forEach((m, i) => {
			const num = getSpecies(m.speciesId)?.num;
			if (num === undefined) return;
			if (dexNums.has(num))
				out.push(err(`members.${i}.speciesId`, 'member.speciesDuplicate', { value: m.speciesId }));
			dexNums.add(num);
		});
	}
	if (reg.rules.itemClause) {
		const items = new Set<string>();
		team.members.forEach((m, i) => {
			if (!m.itemId) return;
			if (items.has(m.itemId))
				out.push(err(`members.${i}.itemId`, 'member.itemDuplicate', { value: m.itemId }));
			items.add(m.itemId);
		});
	}
	return out;
}

/** True for a real calendar date written DD/MM/YYYY. */
export function isValidDob(dob: string): boolean {
	const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dob);
	if (!m) return false;
	const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const date = new Date(Date.UTC(y, mo - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function validatePlayer(player: Player): Issue[] {
	const out: Issue[] = [];
	if (!player.name.trim()) out.push(err('player.name', 'player.nameMissing'));
	if (!player.playerId.trim()) out.push(err('player.playerId', 'player.playerIdMissing'));
	if (!player.dob.trim()) out.push(err('player.dob', 'player.dobMissing'));
	else if (!isValidDob(player.dob.trim())) out.push(err('player.dob', 'player.dobInvalid'));
	if (!player.division) out.push(err('player.division', 'player.divisionMissing'));
	if (!player.supportId.trim()) out.push(warn('player.supportId', 'player.supportIdMissing'));
	return out;
}

export function validate(team: Team, player: Player): Issue[] {
	return [...validatePlayer(player), ...validateTeam(team)];
}

/** The Generate PDF button is disabled while this is true. */
export function hasErrors(issues: Issue[]): boolean {
	return issues.some((i) => i.level === 'error');
}
