/**
 * Declarative layout of the official Play! Pokémon "Video Game Team List".
 *
 * Every number below was measured from `docs/play-pokemon-vg-team-list.pdf` (see
 * `scripts/pdf/extract-official.ts`), in PDF points on a US Letter page with the origin at the
 * bottom-left. The frame (rules, borders, boxes, checkboxes) and the label positions are frozen to
 * the official template; only the *value* slots (text written inside the fields and boxes) are ours.
 * `pdf.spec.ts` checks the generated frame against the measured fixture.
 */

export type SheetPage = 'staff' | 'opponent';
export type FontKey = 'regular' | 'bold' | 'boldItalic';
export type Align = 'left' | 'center' | 'right';
export type Division = 'juniors' | 'seniors' | 'masters';

export const LETTER = { width: 612, height: 792 } as const;

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Message keys of the printed template labels (`messages/*.json`, prefix `pdf_`). */
export type LabelKey =
	| 'pdf_title'
	| 'pdf_page_of'
	| 'pdf_for_staff'
	| 'pdf_for_opponents'
	| 'pdf_instruction_staff'
	| 'pdf_instruction_opponents'
	| 'pdf_player_name'
	| 'pdf_trainer_name'
	| 'pdf_battle_team'
	| 'pdf_switch_profile'
	| 'pdf_player_id'
	| 'pdf_support_id'
	| 'pdf_dob'
	| 'pdf_age_division'
	| 'pdf_juniors'
	| 'pdf_seniors'
	| 'pdf_masters'
	| 'pdf_pokemon'
	| 'pdf_stat_alignment'
	| 'pdf_ability'
	| 'pdf_held_item'
	| 'pdf_move'
	| 'pdf_stat_hp'
	| 'pdf_stat_atk'
	| 'pdf_stat_def'
	| 'pdf_stat_spa'
	| 'pdf_stat_spd'
	| 'pdf_stat_spe'
	| 'pdf_footer';

/** Either a translated label (`key`) or fixed text that is the same in every language. */
export interface Run {
	key?: LabelKey;
	text?: string;
	params?: Record<string, number>;
	font: FontKey;
}

/** A printed label. `x` is the anchor for `align` (left edge, centre or right edge). */
export interface Label {
	runs: Run[];
	x: number;
	y: number;
	size: number;
	align: Align;
	/** Furthest the text may extend away from the anchor (it shrinks to fit, never moves). */
	maxWidth: number;
}

export type HeaderSlot =
	| 'playerName'
	| 'trainerName'
	| 'battleTeam'
	| 'switchProfile'
	| 'playerId'
	| 'supportId'
	| 'dobDay'
	| 'dobMonth'
	| 'dobYear';
export type BoxSlot =
	| 'species'
	| 'nature'
	| 'ability'
	| 'item'
	| 'move1'
	| 'move2'
	| 'move3'
	| 'move4'
	| 'hp'
	| 'atk'
	| 'def'
	| 'spa'
	| 'spd'
	| 'spe';

/** A place where we write a value. `y` is the text baseline. */
export interface Field {
	slot: HeaderSlot | BoxSlot;
	/** Team slot 0–5 (reading order: left→right, top→bottom); undefined for header fields. */
	box?: number;
	x: number;
	y: number;
	width: number;
	size: number;
	font: FontKey;
	align: Align;
}

export interface Checkbox extends Rect {
	division: Division;
	lineWidth: number;
}

export interface PageLayout {
	/** Solid black rules and borders (the official file draws them as filled rectangles). */
	rects: Rect[];
	checkboxes: Checkbox[];
	labels: Label[];
	fields: Field[];
}

const THICK = 1.68;
const THIN = 0.84;
/** Right column of boxes = left column shifted by this much. */
const COL_DX = 292.13;
const BOX_LEFT = 17.64;
const BOX_INNER_LEFT = 19.32;
const BOX_INNER_RIGHT = 297.89;
const STAT_LINE_X = 247.25;
/** Right edge of the label column inside a box. */
const LABEL_RIGHT = 82.1;
const LABEL_RIGHT_STAT_ALIGNMENT = 82.7;

/** Row geometry of a box, as offsets from the top edge of its thick top border. */
interface BoxShape {
	/** Thin rules between rows. [1] separates the stat-column header rows from the stat cells. */
	lines: number[];
	/** Bottom border. */
	bottom: number;
	/** Label baselines: Pokémon, Stat Alignment, Ability, Held Item, Move 1–4. */
	labelY: number[];
}

const FULL_BOX: BoxShape = {
	lines: [-30.84, -54, -77.16, -100.35, -123.51, -146.67, -169.83],
	bottom: -193.35,
	labelY: [-18.96, -45, -69.84, -93.03, -116.19, -139.35, -162.51, -185.67]
};

/** The official page 1 draws its bottom pair of rows slightly shorter; kept as-is. */
const SHORT_BOX: BoxShape = {
	lines: [-30.87, -54.03, -77.19, -100.35, -123.51, -146.67, -166.83],
	bottom: -190.37,
	labelY: [-18.99, -45.03, -69.87, -93.03, -116.19, -139.35, -160.95, -182.67]
};

const PAGES = {
	staff: {
		boxTops: [629.62, 428.23, 226.85],
		boxShapes: [FULL_BOX, FULL_BOX, SHORT_BOX],
		/** Player Name, Trainer Name, Battle Team, Switch Profile underlines (y). */
		leftRules: [702.1, 680.74, 659.38, 634.9],
		checkboxes: [
			{ division: 'juniors', x: 471.51, y: 703.34, w: 12.26, h: 11.03 },
			{ division: 'seniors', x: 527.18, y: 703.74, w: 12.18, h: 11.01 },
			{ division: 'masters', x: 576.8, y: 704.71, w: 12.18, h: 11.03 }
		],
		/** Label baselines: player name, trainer, battle team, switch profile. */
		leftLabelY: [706.4, 684.3, 664.4, 639.9],
		divisionY: 706.4
	},
	opponent: {
		boxTops: [631.9, 430.51, 229.13],
		boxShapes: [FULL_BOX, FULL_BOX, FULL_BOX],
		leftRules: [703.9, 682.54, 661.18, 636.7],
		checkboxes: [
			{ division: 'juniors', x: 471.51, y: 705.14, w: 12.26, h: 11.03 },
			{ division: 'seniors', x: 527.18, y: 705.54, w: 12.18, h: 11.01 },
			{ division: 'masters', x: 576.8, y: 706.51, w: 12.18, h: 11.03 }
		],
		leftLabelY: [708.2, 686.1, 664.8, 641.7],
		divisionY: 708.2
	}
} as const;

const RULE_LEFT = { x: 140.42, w: 170.3 };
const RULE_RIGHT = { x: 432.55, w: 158.45 };
const HEADER_LABEL_RIGHT = 138.6;
const RIGHT_LABEL_RIGHT = 430.7;
const PAGE_CENTER = 305.5;
/** Printable width we let centred header lines use. */
const CENTER_MAX = 576;

const HEADER_VALUE_SIZE = 12;
const HEADER_VALUE_PAD = 4;
const ROW_VALUE_SIZE = 12.5;
const ROW_VALUE_GAP = 8;
const ROW_VALUE_PAD = 4;
const STAT_VALUE_SIZE = 12;
/** A stat label sits this far below the top of its cell. */
const STAT_LABEL_DROP = 5.42;

const BOX_ROW_SLOTS = [
	'species',
	'nature',
	'ability',
	'item',
	'move1',
	'move2',
	'move3',
	'move4'
] as const;
const STAT_SLOTS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const STAT_LABEL_KEYS: LabelKey[] = [
	'pdf_stat_hp',
	'pdf_stat_atk',
	'pdf_stat_def',
	'pdf_stat_spa',
	'pdf_stat_spd',
	'pdf_stat_spe'
];

function single(
	key: LabelKey,
	font: FontKey,
	x: number,
	y: number,
	size: number,
	align: Align,
	maxWidth: number,
	params?: Record<string, number>
): Label {
	return { runs: [{ key, font, params }], x, y, size, align, maxWidth };
}

export function pageLayout(page: SheetPage): PageLayout {
	const staff = page === 'staff';
	const p = PAGES[page];
	const rects: Rect[] = [];
	const labels: Label[] = [];
	const fields: Field[] = [];
	const rule = (x: number, y: number, w: number, h: number = THIN) => rects.push({ x, y, w, h });

	// --- Header -------------------------------------------------------------------------------
	labels.push(single('pdf_title', 'bold', PAGE_CENTER, 757.1, 13.92, 'center', CENTER_MAX));
	labels.push({
		runs: [
			{ key: 'pdf_page_of', params: { n: staff ? 1 : 2 }, font: 'bold' },
			{ key: staff ? 'pdf_for_staff' : 'pdf_for_opponents', font: 'boldItalic' }
		],
		x: PAGE_CENTER,
		y: 739.2,
		size: 13.92,
		align: 'center',
		maxWidth: CENTER_MAX
	});
	labels.push(
		single(
			staff ? 'pdf_instruction_staff' : 'pdf_instruction_opponents',
			'boldItalic',
			PAGE_CENTER,
			724.7,
			10.44,
			'center',
			CENTER_MAX
		)
	);

	const leftKeys: [LabelKey, number, HeaderSlot][] = [
		['pdf_player_name', 12.24, 'playerName'],
		['pdf_trainer_name', 9.6, 'trainerName'],
		['pdf_battle_team', 9.6, 'battleTeam'],
		['pdf_switch_profile', 9.6, 'switchProfile']
	];
	leftKeys.forEach(([key, size, slot], i) => {
		// Labels may use the page width to the left of the rule; the first ones sit at the page edge.
		labels.push(
			single(
				key,
				'bold',
				HEADER_LABEL_RIGHT,
				p.leftLabelY[i],
				size,
				'right',
				HEADER_LABEL_RIGHT - 18
			)
		);
		rule(RULE_LEFT.x, p.leftRules[i], RULE_LEFT.w);
		fields.push({
			slot,
			x: RULE_LEFT.x + HEADER_VALUE_PAD,
			y: p.leftRules[i] + 2.6,
			width: RULE_LEFT.w - 2 * HEADER_VALUE_PAD,
			size: HEADER_VALUE_SIZE,
			font: 'regular',
			align: 'left'
		});
	});

	// Age division (both pages).
	labels.push(
		single(
			'pdf_age_division',
			'bold',
			RIGHT_LABEL_RIGHT,
			p.divisionY,
			9.6,
			'right',
			RIGHT_LABEL_RIGHT - 312
		)
	);
	const divisionLabels: [LabelKey, number][] = [
		['pdf_juniors', 440.3],
		['pdf_seniors', 492.4],
		['pdf_masters', 543.5]
	];
	divisionLabels.forEach(([key, x], i) => {
		const box = p.checkboxes[i];
		labels.push(single(key, 'bold', x, p.divisionY, 8.76, 'left', box.x - 2 - x));
	});

	const checkboxes: Checkbox[] = p.checkboxes.map((c) => ({ ...c, lineWidth: 0.87 }));

	if (staff) {
		const rightRules = [680.74, 659.38, 634.9];
		const rightLabelY = [684.3, 664.4, 639.9];
		const rightKeys: [LabelKey, number][] = [
			['pdf_player_id', 9.6],
			['pdf_dob', 9.6],
			['pdf_support_id', 12.24]
		];
		rightKeys.forEach(([key, size], i) => {
			labels.push(
				single(
					key,
					'bold',
					RIGHT_LABEL_RIGHT,
					rightLabelY[i],
					size,
					'right',
					RIGHT_LABEL_RIGHT - 312
				)
			);
			rule(RULE_RIGHT.x, rightRules[i], RULE_RIGHT.w);
		});
		for (const [slot, y] of [
			['playerId', rightRules[0]],
			['supportId', rightRules[2]]
		] as const) {
			fields.push({
				slot,
				x: RULE_RIGHT.x + HEADER_VALUE_PAD,
				y: y + 2.6,
				width: RULE_RIGHT.w - 2 * HEADER_VALUE_PAD,
				size: HEADER_VALUE_SIZE,
				font: 'regular',
				align: 'left'
			});
		}
		// Date of birth: the official "/" separators split the rule into day / month / year.
		for (const x of [478.3, 534.1]) {
			labels.push({
				runs: [{ text: '/', font: 'regular' }],
				x,
				y: 664.4,
				size: 15.6,
				align: 'left',
				maxWidth: 10
			});
		}
		const dob: [HeaderSlot, number, number][] = [
			['dobDay', RULE_RIGHT.x, 478.3],
			['dobMonth', 484.3, 534.1],
			['dobYear', 540.1, RULE_RIGHT.x + RULE_RIGHT.w]
		];
		for (const [slot, from, to] of dob) {
			fields.push({
				slot,
				x: (from + to) / 2,
				y: rightRules[1] + 2.6,
				width: to - from - 2,
				size: HEADER_VALUE_SIZE,
				font: 'regular',
				align: 'center'
			});
		}
	}

	// --- Pokémon boxes ------------------------------------------------------------------------
	for (let box = 0; box < 6; box++) {
		const col = box % 2;
		const row = Math.floor(box / 2);
		const dx = col * COL_DX;
		const top = p.boxTops[row];
		const shape = p.boxShapes[row];
		const bottomY = top + shape.bottom;

		// Thick frame.
		rule(BOX_LEFT + dx, bottomY, THICK, top - bottomY + THICK);
		rule(BOX_INNER_RIGHT + dx, bottomY, THICK, top - bottomY + THICK);
		rule(BOX_INNER_LEFT + dx, top, 280.25, THICK);
		rule(BOX_INNER_LEFT + dx, bottomY, 280.25, THICK);
		// Row rules.
		for (const off of shape.lines) rule(BOX_INNER_LEFT + dx, top + off, 278.57);
		// Stat column (page 1 only).
		const statCellTops = shape.lines.slice(1).map((off) => top + off);
		if (staff) {
			const y0 = bottomY + THICK;
			rule(STAT_LINE_X + dx, y0, THIN, statCellTops[0] - y0);
		}

		const rowRight = (r: number) =>
			(staff && r >= 2 ? STAT_LINE_X : BOX_INNER_RIGHT) + dx - ROW_VALUE_PAD;
		BOX_ROW_SLOTS.forEach((slot, r) => {
			const baseline = top + shape.labelY[r];
			const labelRight = (r === 1 ? LABEL_RIGHT_STAT_ALIGNMENT : LABEL_RIGHT) + dx;
			const size = r === 1 ? 9.12 : 13.92;
			const key: LabelKey =
				r === 0
					? 'pdf_pokemon'
					: r === 1
						? 'pdf_stat_alignment'
						: r === 2
							? 'pdf_ability'
							: r === 3
								? 'pdf_held_item'
								: 'pdf_move';
			// Labels may grow leftwards until the inner border.
			labels.push(
				single(
					key,
					'bold',
					labelRight,
					baseline,
					size,
					'right',
					labelRight - (BOX_INNER_LEFT + dx) - 3,
					r >= 4 ? { n: r - 3 } : undefined
				)
			);
			const x = LABEL_RIGHT + dx + ROW_VALUE_GAP;
			fields.push({
				slot,
				box,
				x,
				y: baseline,
				width: rowRight(r) - x,
				size: r === 1 ? 11 : ROW_VALUE_SIZE,
				font: 'regular',
				align: 'left'
			});
		});

		if (staff) {
			STAT_SLOTS.forEach((slot, i) => {
				const cellTop = statCellTops[i];
				const left = STAT_LINE_X + dx + THIN;
				labels.push(
					single(
						STAT_LABEL_KEYS[i],
						'bold',
						left + 0.46 + 1.07,
						cellTop - STAT_LABEL_DROP,
						5.6,
						'left',
						BOX_INNER_RIGHT + dx - left - 2
					)
				);
				fields.push({
					slot,
					box,
					x: (left + BOX_INNER_RIGHT + dx) / 2,
					y: cellTop - 17.6,
					width: BOX_INNER_RIGHT + dx - left - 6,
					size: STAT_VALUE_SIZE,
					font: 'bold',
					align: 'center'
				});
			});
		}
	}

	// --- Footer -------------------------------------------------------------------------------
	labels.push(single('pdf_footer', 'regular', 304.75, 22.6, 7.8, 'center', CENTER_MAX));

	return { rects, checkboxes, labels, fields };
}
