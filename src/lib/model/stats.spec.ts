import { describe, expect, it } from 'vitest';
import { getSpecies } from '../data/index.js';
import { calcStat, calcStats } from './stats.js';
import { emptyStatPoints, totalSp, type StatPoints } from './types.js';

const sp = (p: Partial<StatPoints>): StatPoints => ({ ...emptyStatPoints(), ...p });

describe('calcStat', () => {
	it('HP = base + 75 + SP', () => {
		expect(calcStat('hp', 88, 32)).toBe(195);
	});
	it('applies nature +/− with floor', () => {
		expect(calcStat('spe', 105, 30, { plus: 'spe' })).toBe(170);
		expect(calcStat('spa', 100, 0, { minus: 'spa' })).toBe(108);
		expect(calcStat('atk', 115, 32, { plus: 'spe', minus: 'spa' })).toBe(167);
	});
});

describe('calcStats (op.gg fixtures)', () => {
	it('Pawmot Jolly 32 Atk / 30 Spe', () => {
		const stats = calcStats(getSpecies('pawmot')!.baseStats, sp({ atk: 32, spe: 30 }), 'jolly');
		expect(stats.atk).toBe(167);
		expect(stats.spe).toBe(170);
	});
	it('Dragapult Jolly 32 HP', () => {
		const stats = calcStats(getSpecies('dragapult')!.baseStats, sp({ hp: 32 }), 'jolly');
		expect(stats.hp).toBe(195);
	});
	it('unknown or neutral nature leaves stats unmodified', () => {
		const base = getSpecies('pawmot')!.baseStats;
		expect(calcStats(base, sp({}), 'bashful').atk).toBe(135);
		expect(calcStats(base, sp({}), undefined).atk).toBe(135);
	});
});

describe('totalSp', () => {
	it('sums all stats', () => {
		expect(totalSp(sp({ hp: 2, spa: 32, spe: 32 }))).toBe(66);
	});
});
