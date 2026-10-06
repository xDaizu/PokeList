import { getNature, type StatKey } from '../data/index.js';
import type { StatPoints } from './types.js';
import { STAT_KEYS } from './types.js';

/** Champions Lv50 stat: HP = base + 75 + SP; others = ⌊(base + 20 + SP) × nature⌋. */
export function calcStat(
	stat: StatKey,
	base: number,
	sp: number,
	nature: { plus?: StatKey; minus?: StatKey } = {}
): number {
	if (stat === 'hp') return base + 75 + sp;
	// Integer math (×10) avoids float error on values like 155 × 1.1.
	const mult = nature.plus === stat ? 11 : nature.minus === stat ? 9 : 10;
	return Math.floor(((base + 20 + sp) * mult) / 10);
}

export function calcStats(
	baseStats: Record<StatKey, number>,
	sp: StatPoints,
	natureId?: string
): Record<StatKey, number> {
	const nature = (natureId && getNature(natureId)) || {};
	const out = {} as Record<StatKey, number>;
	for (const k of STAT_KEYS) out[k] = calcStat(k, baseStats[k], sp[k], nature);
	return out;
}
