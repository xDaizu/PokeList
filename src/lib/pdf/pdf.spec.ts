import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { beforeAll, describe, expect, it } from 'vitest';
import { emptyPlayer, type Player, type Team } from '../model/types.js';
import { pageLayout } from './layout.js';
import { fitText, renderTeamSheet, sheetFilename } from './render.js';
import {
	extractGeometry,
	extractText,
	inkMismatch,
	fixturePlayer,
	fixtureTeam,
	nodeFonts,
	rasterizeRects,
	renderPagePng,
	type GeoPage
} from './test-helpers.js';

const fonts = nodeFonts();
const official = (
	JSON.parse(readFileSync('tests/fixtures/official-layout.json', 'utf8')) as { pages: GeoPage[] }
).pages;
const A4 = { width: 595.28, height: 841.89 };

const render = (player: Player, team: Team, lang: 'en' | 'es', pageSize: 'a4' | 'letter' = 'a4') =>
	renderTeamSheet(player, team, { lang, fonts, pageSize });

describe('official frame', () => {
	// Letter is the template's native size, so the frame can be compared 1:1. No division is ticked so
	// that the only strokes are the empty checkboxes.
	let ours: GeoPage[];
	beforeAll(async () => {
		ours = await extractGeometry(
			await render({ ...fixturePlayer(), division: '' }, fixtureTeam(), 'en', 'letter')
		);
	});

	it('has the same page size as the official PDF', () => {
		expect(ours).toHaveLength(2);
		for (const [i, page] of ours.entries()) {
			expect(page.width).toBe(official[i].width);
			expect(page.height).toBe(official[i].height);
		}
	});

	it.each([0, 1])('page %i frame covers the same ink as the official one', (i) => {
		const res = 4;
		const a = rasterizeRects(official[i], res);
		const b = rasterizeRects(ours[i], res);
		// Allow a one-pixel (0.25 pt) tolerance for sub-point jitter in the official file's coordinates.
		const w = Math.ceil(official[i].width * res);
		const h = Math.ceil(official[i].height * res);
		expect(inkMismatch(a, b, w, h)).toBe(0);
	});

	it.each([0, 1])('page %i labels match the official text, size and position (EN)', (i) => {
		for (const want of official[i].texts) {
			const match = ours[i].texts.find(
				(t) =>
					t.str === want.str &&
					Math.abs(t.x - want.x) <= 1.6 &&
					Math.abs(t.y - want.y) <= 0.5 &&
					Math.abs(t.size - want.size) <= 0.2
			);
			expect(match, `"${want.str}" at ${want.x},${want.y} size ${want.size}`).toBeDefined();
		}
	});
});

describe('content', () => {
	it('renders two A4 pages', async () => {
		const pages = await extractGeometry(await render(fixturePlayer(), fixtureTeam(), 'en'));
		expect(pages).toHaveLength(2);
		for (const p of pages) {
			expect(p.width).toBeCloseTo(A4.width, 1);
			expect(p.height).toBeCloseTo(A4.height, 1);
		}
	});

	it('scales the template uniformly onto A4 and keeps it on the page', async () => {
		const [a4] = await extractGeometry(await render(fixturePlayer(), fixtureTeam(), 'en', 'a4'));
		const s = A4.width / 612;
		const title = a4.texts.find((t) => t.str === 'Pokémon Video Game Team List')!;
		const ref = official[0].texts.find((t) => t.str === 'Pokémon Video Game Team List')!;
		expect(title.size).toBeCloseTo(ref.size * s, 1);
		expect(Math.abs(title.x - ref.x * s)).toBeLessThan(1.5);
		const ty = (A4.height - 792 * s) / 2;
		expect(Math.abs(title.y - (ref.y * s + ty))).toBeLessThan(0.5);
		for (const r of a4.rects) {
			expect(r.x).toBeGreaterThanOrEqual(0);
			expect(r.x + r.w).toBeLessThanOrEqual(A4.width);
			expect(r.y).toBeGreaterThanOrEqual(0);
			expect(r.y + r.h).toBeLessThanOrEqual(A4.height);
		}
	});

	it('EN: page 1 has staff-only data and SP, page 2 does not', async () => {
		const [p1, p2] = await extractText(await render(fixturePlayer(), fixtureTeam(), 'en'));
		for (const s of [
			'1 of 2:',
			'For Tournament Staff',
			'Player ID:',
			'Date of Birth:',
			'Support ID',
			'Sahil Example',
			'1234567',
			'ABC123',
			'Indeedee',
			'Psychic Surge',
			'Focus Sash',
			'Expanding Force',
			'Timid',
			'Sp. Atk',
			'32'
		]) {
			expect(p1, s).toContain(s);
		}
		expect(p2).toContain('2 of 2:');
		expect(p2).toContain('For Opponents');
		expect(p2).toContain('Sahil Example');
		expect(p2).toContain('Indeedee');
		for (const s of [
			'Player ID:',
			'Date of Birth:',
			'Support ID',
			'1234567',
			'ABC123',
			'Sp. Atk'
		]) {
			expect(p2, s).not.toContain(s);
		}
		// Stat Points are numbers on their own; no number lines appear on the opponent page.
		expect(p2.split('\n').filter((l) => /^\d+$/.test(l))).toEqual([]);
	});

	it('prints the stat points of each member', async () => {
		const [page] = await extractGeometry(await render(fixturePlayer(), fixtureTeam(), 'en'));
		const sp = page.texts.filter((t) => /^\d+$/.test(t.str) && t.size > 8).map((t) => t.str);
		// 6 Pokémon x 6 stats, plus the DOB parts (07, 03, 1998) and nothing else.
		expect(sp.filter((s) => s.length <= 2)).toHaveLength(36 + 2);
	});

	it('writes the date of birth as DD/MM/YYYY', async () => {
		const [p1] = await extractText(await render(fixturePlayer(), fixtureTeam(), 'en'));
		expect(p1).toContain('07');
		expect(p1).toContain('03');
		expect(p1).toContain('1998');
		expect(p1).not.toContain('7/3/1998');
	});

	it('lists a Mega as its base species with the Mega Stone as item', async () => {
		const [p1] = await extractText(await render(fixturePlayer(), fixtureTeam(), 'en'));
		expect(p1).toContain('Charizard');
		expect(p1).toContain('Charizardite Y');
		expect(p1).not.toMatch(/Mega/);
		const team = fixtureTeam();
		team.members[3].speciesId = 'charizardmegay';
		const [mega] = await extractText(await render(fixturePlayer(), team, 'en'));
		expect(mega).not.toMatch(/Mega/);
	});

	it('ES: labels and names are Spanish', async () => {
		const [p1, p2] = await extractText(await render(fixturePlayer(), fixtureTeam(), 'es'));
		for (const s of [
			'Lista de equipo de videojuegos Pokémon',
			'1 de 2:',
			'Para el personal del torneo',
			'Nombre del jugador:',
			'ID de jugador:',
			'Fecha de nacimiento:',
			'Habilidad',
			'Naturaleza',
			'Objeto',
			'Mov. 1',
			'At. Esp.',
			'Miedosa',
			'Psicogénesis',
			'Banda Aguante'
		]) {
			expect(p1, s).toContain(s);
		}
		expect(p2).toContain('2 de 2:');
		expect(p2).toContain('Para los oponentes');
		expect(p1).not.toContain('Ability');
		expect(p1).not.toContain('Held Item');
	});

	it('ticks only the selected age division', async () => {
		const marks = async (division: Player['division']) => {
			const [page] = await extractGeometry(
				await render({ ...fixturePlayer(), division }, fixtureTeam(), 'en', 'letter')
			);
			// The two diagonals of a tick are strokes inside a checkbox.
			return page.rects.filter(
				(r) => r.kind === 'stroke' && r.y > 700 && r.x > 460 && r.w < 12 && r.lineWidth !== 0.87
			).length;
		};
		expect(await marks('')).toBe(0);
		expect(await marks('masters')).toBe(2);
	});

	it('leaves blank player info and missing members empty instead of failing', async () => {
		const team = fixtureTeam();
		team.members = team.members.slice(0, 2);
		const [p1] = await extractText(await render(emptyPlayer(), team, 'en'));
		expect(p1).toContain('Indeedee');
		expect(p1).toContain('Gliscor');
		expect(p1).not.toContain('Kingambit');
	});

	it('names the file after the player id', () => {
		expect(sheetFilename(fixturePlayer())).toBe('PokeListo-1234567.pdf');
		expect(sheetFilename(emptyPlayer())).toBe('PokeListo-team.pdf');
		expect(sheetFilename({ ...emptyPlayer(), playerId: '../a b' })).toBe('PokeListo-ab.pdf');
	});
});

describe('fitting', () => {
	it('shrinks long values and truncates when even the minimum does not fit', async () => {
		const doc = await PDFDocument.create();
		doc.registerFontkit(fontkit);
		const font = await doc.embedFont(fonts.regular, { subset: true });
		const width = 100;

		const short = fitText(font, 'Protect', 12.5, width);
		expect(short.size).toBe(12.5);

		const long = fitText(font, 'Extremely Long Move Name Here', 12.5, width);
		expect(long.size).toBeLessThan(12.5);
		expect(long.width).toBeLessThanOrEqual(width);

		const absurd = fitText(font, 'W'.repeat(120), 12.5, width);
		expect(absurd.text.endsWith('…')).toBe(true);
		expect(absurd.width).toBeLessThanOrEqual(width);
	});

	it('keeps every long value inside its box on the rendered page', async () => {
		const long = 'Supercalifragilistic Extraordinarily Long Name '.repeat(3);
		const team = fixtureTeam();
		for (const m of team.members) m.speciesId = 'indeedee';
		const player: Player = {
			...fixturePlayer(),
			name: long,
			trainerName: long,
			battleTeam: long,
			switchProfile: long,
			playerId: '9'.repeat(60),
			supportId: long
		};
		const pages = await extractGeometry(await render(player, team, 'en', 'letter'));
		const layouts = [pageLayout('staff'), pageLayout('opponent')];
		for (const [i, page] of pages.entries()) {
			for (const f of layouts[i].fields) {
				const left = f.align === 'left' ? f.x : f.x - f.width / 2;
				const candidates = page.texts.filter(
					(t) => Math.abs(t.y - f.y) < 0.05 && t.x >= left - 0.5 && t.x <= left + f.width
				);
				for (const t of candidates) {
					expect(t.x, f.slot).toBeGreaterThanOrEqual(left - 0.5);
					expect(t.x + t.width, f.slot).toBeLessThanOrEqual(left + f.width + 0.5);
				}
			}
		}
	});
});

describe('visual baseline', () => {
	// Rendered with pdf.js; regenerate with UPDATE_PDF_BASELINE=1 after an intentional change.
	const dir = 'tests/fixtures/pdf-baseline';
	const update = process.env.UPDATE_PDF_BASELINE === '1';

	it.each([
		['en', 1],
		['en', 2],
		['es', 1],
		['es', 2]
	] as const)('%s page %i matches the committed rendering', async (lang, pageNo) => {
		const bytes = await render(fixturePlayer(), fixtureTeam(), lang);
		const { png, width, height } = await renderPagePng(bytes, pageNo, 1);
		const file = `${dir}/${lang}-${pageNo}.png`;
		if (update || !existsSync(file)) {
			mkdirSync(dir, { recursive: true });
			writeFileSync(file, png);
		}
		const pixels = async (buf: Buffer) => {
			const img = await loadImage(buf);
			const canvas = createCanvas(img.width, img.height);
			const ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, 0);
			return {
				data: ctx.getImageData(0, 0, img.width, img.height).data,
				w: img.width,
				h: img.height
			};
		};
		const got = await pixels(png);
		const want = await pixels(readFileSync(file));
		expect([got.w, got.h]).toEqual([width, height]);
		expect([want.w, want.h]).toEqual([width, height]);
		let off = 0;
		for (let i = 0; i < got.data.length; i += 4) {
			if (Math.abs(got.data[i] - want.data[i]) > 96) off++;
		}
		// Tolerate anti-aliasing differences between platforms; real layout changes move far more.
		expect(off / (width * height)).toBeLessThan(0.003);
	});
});
