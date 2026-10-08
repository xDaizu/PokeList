import { normalize } from '../data/normalize.js';
import { resolveAlias, getCurrentRegulation, type StatKey } from '../data/index.js';
import {
	MAX_SP_PER_STAT,
	MOVES_PER_MEMBER,
	TEAM_SIZE,
	STAT_KEYS,
	emptyMember,
	emptyStatPoints,
	type Member,
	type StatPoints,
	type Team
} from '../model/types.js';

export type PasteErrorCode =
	| 'unknownSpecies'
	| 'unknownItem'
	| 'unknownAbility'
	| 'unknownNature'
	| 'unknownMove'
	| 'unknownStat'
	| 'badStatPoints'
	| 'evsNotStatPoints'
	| 'tooManyMoves'
	| 'tooManyMembers'
	| 'unrecognizedLine';

export interface PasteError {
	/** 1-based line in the pasted text. */
	line: number;
	code: PasteErrorCode;
	/** Offending text, for display. */
	value: string;
}

export interface ParseResult {
	members: Member[];
	errors: PasteError[];
}

const STAT_ALIASES: Record<string, StatKey> = {
	hp: 'hp',
	ps: 'hp',
	atk: 'atk',
	attack: 'atk',
	atq: 'atk',
	ataque: 'atk',
	def: 'def',
	defense: 'def',
	defensa: 'def',
	spa: 'spa',
	spatk: 'spa',
	spattack: 'spa',
	satk: 'spa',
	atqesp: 'spa',
	atesp: 'spa',
	spd: 'spd',
	spdef: 'spd',
	spdefense: 'spd',
	sdef: 'spd',
	defesp: 'spd',
	spe: 'spe',
	speed: 'spe',
	vel: 'spe',
	velocidad: 'spe'
};

const SP_COMMENT = /^#\s*champions\s+stat\s+points\s*:\s*(.*)$/i;
const ABILITY_LINE = /^(?:ability|habilidad)\s*:\s*(.+)$/i;
const NATURE_SUFFIX = /^(.+?)\s+(?:nature|naturaleza)$/i;
const NATURE_PREFIX = /^(?:nature|naturaleza)\s*:?\s*(.+)$/i;
const STATS_LINE = /^(?:evs|ivs)\s*:\s*(.*)$/i;
// Lines with no bearing on the team sheet.
const IGNORED_LINE =
	/^(?:level|nivel|shiny|happiness|tera\s*type|ivs|pokeball|gigantamax|dynamax\s*level)\s*:/i;

interface Line {
	no: number;
	text: string;
}

/** Parses "HP 2 / SpA 32" (or EV-style "252 HP / 4 Atk") into stat points, reporting problems. */
function parseStatList(
	body: string,
	lineNo: number,
	valueFirst: boolean,
	errors: PasteError[]
): StatPoints {
	const sp = emptyStatPoints();
	for (const part of body.split('/')) {
		const text = part.trim();
		if (!text) continue;
		const m = valueFirst
			? /^(\d+)\s*([^\d\s].*)$/.exec(text)
			: /^([^\d\s][^\d]*?)\s*(\d+)$/.exec(text);
		const stat = m && STAT_ALIASES[normalize(valueFirst ? m[2] : m[1])];
		if (!m || !stat) {
			errors.push({ line: lineNo, code: m ? 'unknownStat' : 'badStatPoints', value: text });
			continue;
		}
		sp[stat] = Number(valueFirst ? m[1] : m[2]);
	}
	return sp;
}

function parseHeader(text: string, lineNo: number, member: Member, errors: PasteError[]): void {
	const at = text.indexOf(' @ ');
	const namePart = (at >= 0 ? text.slice(0, at) : text.replace(/\s*@\s*$/, '')).trim();
	const itemPart = at >= 0 ? text.slice(at + 3).trim() : '';

	// "Nickname (Species) (M)" → Species; "Species (F)" → Species.
	const withoutGender = namePart.replace(/\s*\((?:M|F)\)\s*$/i, '');
	const nick = /^.+\(([^()]+)\)$/.exec(withoutGender);
	const candidates = nick ? [nick[1], withoutGender] : [withoutGender];
	const speciesId = candidates.map((c) => resolveAlias('species', c)).find(Boolean);
	if (speciesId) member.speciesId = speciesId;
	else errors.push({ line: lineNo, code: 'unknownSpecies', value: withoutGender });

	if (itemPart) {
		const itemId = resolveAlias('items', itemPart);
		if (itemId) member.itemId = itemId;
		else errors.push({ line: lineNo, code: 'unknownItem', value: itemPart });
	}
}

function parseBlock(lines: Line[], errors: PasteError[]): Member {
	const member = emptyMember();
	let spFromComment: StatPoints | undefined;
	let spFromEvs: { sp: StatPoints; line: number } | undefined;
	let sawMoves = 0;

	parseHeader(lines[0].text, lines[0].no, member, errors);

	for (const { no, text } of lines.slice(1)) {
		let m: RegExpExecArray | null;
		if ((m = SP_COMMENT.exec(text))) {
			spFromComment = parseStatList(m[1], no, false, errors);
		} else if (text.startsWith('#')) {
			// Other comments (mega preview/ability, notes) are informational only.
		} else if ((m = ABILITY_LINE.exec(text))) {
			const id = resolveAlias('abilities', m[1]);
			if (id) member.abilityId = id;
			else errors.push({ line: no, code: 'unknownAbility', value: m[1].trim() });
		} else if (text.startsWith('-')) {
			const name = text.replace(/^-\s*/, '').trim();
			// Some exporters put alternatives on one line ("- Surf / Ice Beam"); take them as written.
			sawMoves++;
			if (sawMoves > MOVES_PER_MEMBER) {
				if (sawMoves === MOVES_PER_MEMBER + 1)
					errors.push({ line: no, code: 'tooManyMoves', value: name });
				continue;
			}
			const id = resolveAlias('moves', name);
			if (id) member.moveIds.push(id);
			else errors.push({ line: no, code: 'unknownMove', value: name });
		} else if ((m = STATS_LINE.exec(text))) {
			if (m[0].toLowerCase().startsWith('evs')) {
				const sub: PasteError[] = [];
				const sp = parseStatList(m[1], no, true, sub);
				if (sub.length) errors.push(...sub);
				else spFromEvs = { sp, line: no };
			}
		} else if (IGNORED_LINE.test(text)) {
			// Level / IVs / Tera Type etc. don't apply to Champions team sheets.
		} else if ((m = NATURE_SUFFIX.exec(text) ?? NATURE_PREFIX.exec(text))) {
			const id = resolveAlias('natures', m[1]);
			if (id) member.natureId = id;
			else errors.push({ line: no, code: 'unknownNature', value: m[1].trim() });
		} else {
			errors.push({ line: no, code: 'unrecognizedLine', value: text });
		}
	}

	if (spFromComment) {
		member.sp = spFromComment;
	} else if (spFromEvs) {
		// Plain EVs are only accepted when they already look like Stat Points.
		if (STAT_KEYS.every((k) => spFromEvs!.sp[k] <= MAX_SP_PER_STAT)) member.sp = spFromEvs.sp;
		else
			errors.push({
				line: spFromEvs.line,
				code: 'evsNotStatPoints',
				value: lines.find((l) => l.no === spFromEvs!.line)!.text
			});
	}
	return member;
}

/** Parses a Showdown-format paste (EN or ES names) into members. Never throws; problems land in `errors`. */
export function parseShowdown(text: string): ParseResult {
	const errors: PasteError[] = [];
	const blocks: Line[][] = [];
	let current: Line[] = [];

	(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/).forEach((raw, i) => {
		const line = raw.trim();
		if (!line) {
			if (current.length) blocks.push(current);
			current = [];
		} else {
			current.push({ no: i + 1, text: line });
		}
	});
	if (current.length) blocks.push(current);

	const members = blocks.map((b) => parseBlock(b, errors));
	if (members.length > TEAM_SIZE) {
		const extra = blocks[TEAM_SIZE][0];
		errors.push({ line: extra.no, code: 'tooManyMembers', value: extra.text });
		members.length = TEAM_SIZE;
	}
	errors.sort((a, b) => a.line - b.line);
	return { members, errors };
}

/** Wraps parsed members into a fresh Team. */
export function toTeam(
	members: Member[],
	opts: { id?: string; name?: string; regulationId?: string } = {}
): Team {
	return {
		id: opts.id ?? crypto.randomUUID(),
		name: opts.name ?? '',
		regulationId: opts.regulationId ?? getCurrentRegulation().id,
		members,
		updatedAt: Date.now()
	};
}
