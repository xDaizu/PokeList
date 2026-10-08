import {
	PDFDocument,
	concatTransformationMatrix,
	popGraphicsState,
	pushGraphicsState,
	rgb,
	type PDFFont,
	type PDFPage
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { m } from '#lib/paraglide/messages.js';
import { getSpecies, nameOf, type Lang } from '../data/index.js';
import type { Member, Player, Team } from '../model/types.js';
import {
	LETTER,
	pageLayout,
	type Field,
	type FontKey,
	type Label,
	type PageLayout,
	type SheetPage
} from './layout.js';

export type PageSize = 'a4' | 'letter';

const PAGE_SIZES: Record<PageSize, { width: number; height: number }> = {
	letter: LETTER,
	a4: { width: 595.28, height: 841.89 }
};

export type FontData = ArrayBuffer | Uint8Array;
export interface SheetFonts {
	regular: FontData;
	bold: FontData;
	boldItalic: FontData;
}

export interface RenderOptions {
	lang: Lang;
	fonts: SheetFonts;
	/** The official template is US Letter; A4 scales it uniformly so proportions are untouched. */
	pageSize?: PageSize;
}

type Fonts = Record<FontKey, PDFFont>;
type MessageFn = (inputs: Record<string, number>, options: { locale: Lang }) => string;

const BLACK = rgb(0, 0, 0);
/** Smallest size a value may shrink to before it is truncated with an ellipsis. */
const MIN_VALUE_SIZE = 6;

const charSets = new WeakMap<PDFFont, Set<number>>();

/** Replaces characters the embedded font cannot draw, so a stray symbol never aborts the PDF. */
function printable(font: PDFFont, text: string): string {
	let set = charSets.get(font);
	if (!set) charSets.set(font, (set = new Set(font.getCharacterSet())));
	let out = '';
	for (const ch of text.normalize('NFC')) {
		const cp = ch.codePointAt(0)!;
		if (cp < 0x20) out += ' ';
		else out += set.has(cp) ? ch : '?';
	}
	return out;
}

/** Shrinks `text` to fit `maxWidth`, truncating with an ellipsis once it is down to `minSize`. */
export function fitText(
	font: PDFFont,
	text: string,
	size: number,
	maxWidth: number,
	minSize = MIN_VALUE_SIZE
): { text: string; size: number; width: number } {
	text = printable(font, text);
	let width = font.widthOfTextAtSize(text, size);
	if (width <= maxWidth) return { text, size, width };
	const shrunk = Math.max(minSize, (size * maxWidth) / width);
	width = font.widthOfTextAtSize(text, shrunk);
	if (width <= maxWidth) return { text, size: shrunk, width };
	let cut = text;
	while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, shrunk) > maxWidth) {
		cut = cut.slice(0, -1);
	}
	cut = `${cut.trimEnd()}…`;
	return { text: cut, size: shrunk, width: font.widthOfTextAtSize(cut, shrunk) };
}

function alignedX(align: Field['align'], x: number, width: number): number {
	return align === 'left' ? x : align === 'center' ? x - width / 2 : x - width;
}

function labelText(run: Label['runs'][number], lang: Lang): string {
	if (run.text !== undefined) return run.text;
	const message = (m as unknown as Record<string, MessageFn>)[run.key!];
	return message(run.params ?? {}, { locale: lang });
}

function drawLabel(page: PDFPage, fonts: Fonts, label: Label, lang: Lang) {
	const runs = label.runs.map((run) => {
		const font = fonts[run.font];
		return { font, text: printable(font, labelText(run, lang)) };
	});
	const gap = fonts[label.runs[0].font].widthOfTextAtSize(' ', label.size);
	const natural =
		runs.reduce((sum, r) => sum + r.font.widthOfTextAtSize(r.text, label.size), 0) +
		gap * (runs.length - 1);
	// Same size as the official template unless the translated text would not fit its slot.
	const scale = Math.min(1, label.maxWidth / natural);
	const size = label.size * scale;
	let x = alignedX(label.align, label.x, natural * scale);
	for (const r of runs) {
		page.drawText(r.text, { x, y: label.y, size, font: r.font, color: BLACK });
		x += r.font.widthOfTextAtSize(r.text, size) + gap * scale;
	}
}

function drawField(page: PDFPage, fonts: Fonts, field: Field, value: string) {
	if (!value) return;
	const font = fonts[field.font];
	const fit = fitText(font, value, field.size, field.width);
	page.drawText(fit.text, {
		x: alignedX(field.align, field.x, fit.width),
		y: field.y,
		size: fit.size,
		font,
		color: BLACK
	});
}

/** DD/MM/YYYY → [DD, MM, YYYY]; anything else is left blank to be handwritten. */
function splitDob(dob: string): [string, string, string] {
	const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dob.trim());
	return match ? [match[1].padStart(2, '0'), match[2].padStart(2, '0'), match[3]] : ['', '', ''];
}

function memberValue(member: Member | undefined, slot: Field['slot'], lang: Lang): string {
	if (!member) return '';
	switch (slot) {
		case 'species': {
			// Megas are listed as their base species; the Mega Stone is the held item.
			const id = getSpecies(member.speciesId)?.baseSpecies ?? member.speciesId;
			return id ? nameOf('species', id, lang) : '';
		}
		case 'nature':
			return member.natureId ? nameOf('natures', member.natureId, lang) : '';
		case 'ability':
			return member.abilityId ? nameOf('abilities', member.abilityId, lang) : '';
		case 'item':
			return member.itemId ? nameOf('items', member.itemId, lang) : '';
		case 'move1':
		case 'move2':
		case 'move3':
		case 'move4': {
			const id = member.moveIds[Number(slot.slice(4)) - 1];
			return id ? nameOf('moves', id, lang) : '';
		}
		case 'hp':
		case 'atk':
		case 'def':
		case 'spa':
		case 'spd':
		case 'spe':
			return member.speciesId ? String(member.sp[slot]) : '';
		default:
			return '';
	}
}

function headerValue(player: Player, slot: Field['slot']): string {
	switch (slot) {
		case 'playerName':
			return player.name;
		case 'trainerName':
			return player.trainerName;
		case 'battleTeam':
			return player.battleTeam;
		case 'switchProfile':
			return player.switchProfile;
		case 'playerId':
			return player.playerId;
		case 'supportId':
			return player.supportId;
		case 'dobDay':
			return splitDob(player.dob)[0];
		case 'dobMonth':
			return splitDob(player.dob)[1];
		case 'dobYear':
			return splitDob(player.dob)[2];
		default:
			return '';
	}
}

function drawSheetPage(
	page: PDFPage,
	fonts: Fonts,
	layout: PageLayout,
	player: Player,
	team: Team,
	lang: Lang
) {
	for (const r of layout.rects) {
		page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: BLACK });
	}
	for (const c of layout.checkboxes) {
		page.drawRectangle({
			x: c.x,
			y: c.y,
			width: c.w,
			height: c.h,
			borderColor: BLACK,
			borderWidth: c.lineWidth
		});
		if (player.division === c.division) {
			const inset = 2.4;
			const line = { thickness: 1.4, color: BLACK };
			page.drawLine({
				start: { x: c.x + inset, y: c.y + inset },
				end: { x: c.x + c.w - inset, y: c.y + c.h - inset },
				...line
			});
			page.drawLine({
				start: { x: c.x + inset, y: c.y + c.h - inset },
				end: { x: c.x + c.w - inset, y: c.y + inset },
				...line
			});
		}
	}
	for (const label of layout.labels) drawLabel(page, fonts, label, lang);
	for (const field of layout.fields) {
		const value =
			field.box === undefined
				? headerValue(player, field.slot)
				: memberValue(team.members[field.box], field.slot, lang);
		drawField(page, fonts, field, value);
	}
}

/** Renders the two-page team list (page 1 for staff, page 2 for opponents). */
export async function renderTeamSheet(
	player: Player,
	team: Team,
	{ lang, fonts: fontData, pageSize = 'a4' }: RenderOptions
): Promise<Uint8Array> {
	const doc = await PDFDocument.create({ updateMetadata: false });
	doc.registerFontkit(fontkit);
	doc.setTitle(m.pdf_title({}, { locale: lang }));
	doc.setProducer('PokeListo');
	doc.setCreator('PokeListo');
	const fonts: Fonts = {
		regular: await doc.embedFont(fontData.regular, { subset: true }),
		bold: await doc.embedFont(fontData.bold, { subset: true }),
		boldItalic: await doc.embedFont(fontData.boldItalic, { subset: true })
	};

	const size = PAGE_SIZES[pageSize];
	// Uniform scale so the Letter-sized template fits the page; centred vertically.
	const scale = Math.min(size.width / LETTER.width, size.height / LETTER.height);
	const tx = (size.width - LETTER.width * scale) / 2;
	const ty = (size.height - LETTER.height * scale) / 2;

	for (const which of ['staff', 'opponent'] as SheetPage[]) {
		const page = doc.addPage([size.width, size.height]);
		page.pushOperators(pushGraphicsState(), concatTransformationMatrix(scale, 0, 0, scale, tx, ty));
		drawSheetPage(page, fonts, pageLayout(which), player, team, lang);
		page.pushOperators(popGraphicsState());
	}
	return doc.save();
}

/** `PokeListo-<playerId|team>.pdf`, restricted to filename-safe characters. */
export function sheetFilename(player: Player): string {
	const id = player.playerId.replace(/[^A-Za-z0-9_-]+/g, '');
	return `PokeListo-${id || 'team'}.pdf`;
}
