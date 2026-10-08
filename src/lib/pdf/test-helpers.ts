import { readFileSync } from 'node:fs';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import type { Member, Player, Team } from '../model/types.js';
import type { SheetFonts } from './render.js';

/** Test/tooling helpers: read the bundled fonts from disk and inspect rendered PDFs with pdf.js. */

const FONT_DIR = 'node_modules/@fontsource/carlito/files';

export function nodeFonts(): SheetFonts {
	const read = (f: string) => new Uint8Array(readFileSync(`${FONT_DIR}/${f}`));
	return {
		regular: read('carlito-latin-400-normal.woff'),
		bold: read('carlito-latin-700-normal.woff'),
		boldItalic: read('carlito-latin-700-italic.woff')
	};
}

export interface GeoRect {
	kind: 'fill' | 'stroke';
	x: number;
	y: number;
	w: number;
	h: number;
	color: string;
	lineWidth?: number;
}
export interface GeoText {
	str: string;
	x: number;
	y: number;
	size: number;
	width: number;
}
export interface GeoPage {
	width: number;
	height: number;
	rects: GeoRect[];
	texts: GeoText[];
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Painted rectangles and positioned text of every page, in user-space points. */
export async function extractGeometry(bytes: Uint8Array): Promise<GeoPage[]> {
	const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
	const names = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));
	const pages: GeoPage[] = [];
	for (let p = 1; p <= doc.numPages; p++) {
		const page = await doc.getPage(p);
		const ol = await page.getOperatorList();
		const rects: GeoRect[] = [];
		let fill = '#000000';
		let stroke = '#000000';
		let lineWidth = 1;
		// Current transformation matrix (axis-aligned scale + translate only, which is all we draw).
		type Ctm = [number, number, number, number, number, number];
		let ctm: Ctm = [1, 0, 0, 1, 0, 0];
		const stack: Ctm[] = [];
		for (let i = 0; i < ol.fnArray.length; i++) {
			const name = names[ol.fnArray[i]];
			const a = ol.argsArray[i] as unknown[];
			if (name === 'save') stack.push(ctm);
			else if (name === 'restore') ctm = stack.pop() ?? ctm;
			else if (name === 'transform') {
				const [ma, , , md, me, mf] = a as number[];
				ctm = [ctm[0] * ma, 0, 0, ctm[3] * md, ctm[0] * me + ctm[4], ctm[3] * mf + ctm[5]];
			} else if (name === 'setFillRGBColor') fill = a[0] as string;
			else if (name === 'setStrokeRGBColor') stroke = a[0] as string;
			else if (name === 'setLineWidth') lineWidth = a[0] as number;
			else if (name === 'constructPath') {
				const kind = names[a[0] as number];
				if (kind !== 'eoFill' && kind !== 'fill' && kind !== 'stroke') continue;
				const [bx0, by0, bx1, by1] = Array.from(a[2] as ArrayLike<number>);
				const x0 = ctm[0] * bx0 + ctm[4];
				const x1 = ctm[0] * bx1 + ctm[4];
				const y0 = ctm[3] * by0 + ctm[5];
				const y1 = ctm[3] * by1 + ctm[5];
				rects.push({
					kind: kind === 'stroke' ? 'stroke' : 'fill',
					x: round(x0),
					y: round(y0),
					w: round(x1 - x0),
					h: round(y1 - y0),
					color: kind === 'stroke' ? stroke : fill,
					...(kind === 'stroke' ? { lineWidth: round(lineWidth * ctm[0]) } : {})
				});
			}
		}
		const tc = await page.getTextContent();
		const texts = tc.items
			.filter((it) => 'str' in it && it.str.trim())
			.map((it) => {
				const t = it as { str: string; transform: number[]; width: number };
				return {
					str: t.str,
					x: round(t.transform[4]),
					y: round(t.transform[5]),
					size: round(Math.abs(t.transform[3])),
					width: round(t.width)
				};
			});
		pages.push({ width: page.view[2], height: page.view[3], rects, texts });
	}
	return pages;
}

/** Plain text of each page, in reading order. */
export async function extractText(bytes: Uint8Array): Promise<string[]> {
	return (await extractGeometry(bytes)).map((p) => p.texts.map((t) => t.str).join('\n'));
}

/** Ink bitmap (1 = black) of the painted rectangles at `res` pixels per point; text excluded. */
export function rasterizeRects(page: GeoPage, res: number): Uint8Array {
	const w = Math.ceil(page.width * res);
	const h = Math.ceil(page.height * res);
	const canvas = createCanvas(w, h);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, w, h);
	ctx.fillStyle = '#000';
	ctx.strokeStyle = '#000';
	for (const r of page.rects) {
		const x = r.x * res;
		const y = (page.height - r.y - r.h) * res;
		if (r.kind === 'fill') ctx.fillRect(x, y, r.w * res, r.h * res);
		else {
			ctx.lineWidth = (r.lineWidth ?? 1) * res;
			ctx.strokeRect(x, y, r.w * res, r.h * res);
		}
	}
	const data = ctx.getImageData(0, 0, w, h).data;
	const out = new Uint8Array(w * h);
	for (let i = 0; i < out.length; i++) out[i] = data[i * 4] < 128 ? 1 : 0;
	return out;
}

/**
 * Inked pixels of `a` with no ink within one pixel of the same spot in `b`, plus the reverse.
 * A one-pixel tolerance at `res` pixels per point ignores sub-point jitter between two drawings.
 */
export function inkMismatch(a: Uint8Array, b: Uint8Array, width: number, height: number): number {
	const near = (img: Uint8Array, x: number, y: number) => {
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				const xx = x + dx;
				const yy = y + dy;
				if (xx >= 0 && yy >= 0 && xx < width && yy < height && img[yy * width + xx]) return true;
			}
		}
		return false;
	};
	let bad = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = y * width + x;
			if ((a[i] && !near(b, x, y)) || (b[i] && !near(a, x, y))) bad++;
		}
	}
	return bad;
}

/** Renders a PDF page with pdf.js to a PNG. */
export async function renderPagePng(bytes: Uint8Array, pageNo: number, scale: number) {
	const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
	const page = await doc.getPage(pageNo);
	const vp = page.getViewport({ scale });
	const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	await page.render({
		canvasContext: ctx as unknown as CanvasRenderingContext2D,
		viewport: vp,
		canvas: canvas as unknown as HTMLCanvasElement
	}).promise;
	return { png: canvas.toBuffer('image/png'), width: canvas.width, height: canvas.height };
}

/** The Sahil sample (Indeedee, Gliscor, Kingambit, Charizard, Annihilape, Venusaur) as a Team. */
export function fixtureTeam(): Team {
	const members = JSON.parse(readFileSync('tests/fixtures/sahil.members.json', 'utf8')) as Member[];
	return { id: 'fixture', name: 'Sahil', regulationId: 'M-C', members, updatedAt: 0 };
}

export function fixturePlayer(): Player {
	return {
		name: 'Sahil Example',
		trainerName: 'Sahil',
		playerId: '1234567',
		dob: '7/3/1998',
		division: 'masters',
		switchProfile: 'SahilVGC',
		supportId: 'ABC123',
		battleTeam: 'Team 1'
	};
}
