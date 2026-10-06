import dex from './generated/dex.json';
import regulationsJson from './generated/regulations.json';
import namesEn from './generated/names.en.json';
import namesEs from './generated/names.es.json';
import aliases from './generated/aliases.json';
import { normalize } from './normalize.js';

export type Kind = 'species' | 'moves' | 'items' | 'abilities' | 'natures';
export type Lang = 'en' | 'es';
export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

export interface Species {
	id: string;
	num: number;
	types: string[];
	baseStats: Record<StatKey, number>;
	abilities: string[];
	baseSpecies?: string;
}

export interface Regulation {
	id: string;
	name: string;
	current: boolean;
	rules: {
		teamSize: number;
		bring: number;
		level: number;
		speciesClause: boolean;
		itemClause: boolean;
	};
	species: string[];
	items: string[];
	abilities: string[];
	moves: string[];
}

const NAMES: Record<Lang, Record<Kind, Record<string, string>>> = { en: namesEn, es: namesEs };
const ALIASES = aliases as Record<Kind, Record<string, string>>;

export const regulations: Regulation[] = regulationsJson;

export function getRegulation(id: string): Regulation | undefined {
	return regulations.find((r) => r.id === id);
}

export function getCurrentRegulation(): Regulation {
	return regulations.find((r) => r.current) ?? regulations[0];
}

export function getSpecies(id: string): Species | undefined {
	const s = (dex.species as Record<string, Omit<Species, 'id'>>)[id];
	return s && { id, ...s };
}

export function getMove(
	id: string
): { type: string; category: string; basePower: number } | undefined {
	return (dex.moves as Record<string, { type: string; category: string; basePower: number }>)[id];
}

export function getNature(id: string): { plus?: StatKey; minus?: StatKey } | undefined {
	return (dex.natures as Record<string, { plus?: StatKey; minus?: StatKey }>)[id];
}

/** Base species a mega stone evolves, if `itemId` is a mega stone. */
export function megaStoneBase(itemId: string): string | undefined {
	return (dex.items as Record<string, { mega?: string }>)[itemId]?.mega;
}

export function nameOf(kind: Kind, id: string, lang: Lang): string {
	return NAMES[lang][kind][id] ?? id;
}

/** Resolve an EN/ES name (any case/accents/punctuation) to an id. Mega species names resolve to their base species. */
export function resolveAlias(kind: Kind, text: string): string | undefined {
	return ALIASES[kind][normalize(text)];
}

export function allIds(kind: Kind): string[] {
	return Object.keys(NAMES.en[kind]);
}
