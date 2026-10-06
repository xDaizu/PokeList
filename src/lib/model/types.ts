import type { StatKey } from '../data/index.js';

export type { StatKey };

export const STAT_KEYS: readonly StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

/** Stat Points per stat (Champions: 0–32 each, 66 total). */
export type StatPoints = Record<StatKey, number>;

export const MAX_SP_PER_STAT = 32;
export const MAX_SP_TOTAL = 66;
export const TEAM_SIZE = 6;
export const MOVES_PER_MEMBER = 4;

export interface Member {
	speciesId: string;
	abilityId: string;
	itemId: string;
	natureId: string;
	moveIds: string[];
	sp: StatPoints;
}

export interface Team {
	id: string;
	name: string;
	regulationId: string;
	members: Member[];
	updatedAt: number;
}

export interface Player {
	name: string;
	trainerName: string;
	playerId: string;
	/** DD/MM/YYYY */
	dob: string;
	division: 'junior' | 'senior' | 'masters' | '';
	switchProfile: string;
	supportId: string;
	battleTeam: string;
}

export function emptyStatPoints(): StatPoints {
	return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

export function emptyMember(): Member {
	return {
		speciesId: '',
		abilityId: '',
		itemId: '',
		natureId: '',
		moveIds: [],
		sp: emptyStatPoints()
	};
}

export function emptyPlayer(): Player {
	return {
		name: '',
		trainerName: '',
		playerId: '',
		dob: '',
		division: '',
		switchProfile: '',
		supportId: '',
		battleTeam: ''
	};
}

export function totalSp(sp: StatPoints): number {
	return STAT_KEYS.reduce((sum, k) => sum + sp[k], 0);
}
