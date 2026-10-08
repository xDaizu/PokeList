/**
 * Renders the fixture team to `.cache/pdf/` (EN + ES, A4 + Letter) with PNG previews, plus an overlay
 * of our Letter output against the official template: official ink red, ours blue, both black.
 * Run: npx tsx scripts/pdf/preview.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
import { renderTeamSheet } from '../../src/lib/pdf/render.ts';
import {
	extractGeometry,
	fixturePlayer,
	fixtureTeam,
	nodeFonts,
	rasterizeRects,
	renderPagePng
} from '../../src/lib/pdf/test-helpers.ts';

const out = '.cache/pdf';
mkdirSync(out, { recursive: true });
const fonts = nodeFonts();
const player = fixturePlayer();
const team = fixtureTeam();

for (const lang of ['en', 'es'] as const) {
	for (const pageSize of ['a4', 'letter'] as const) {
		const bytes = await renderTeamSheet(player, team, { lang, fonts, pageSize });
		writeFileSync(`${out}/${lang}-${pageSize}.pdf`, bytes);
		for (const n of [1, 2]) {
			const { png } = await renderPagePng(bytes, n, 1.4);
			writeFileSync(`${out}/${lang}-${pageSize}-${n}.png`, png);
		}
	}
}

// Overlay: official vs ours (EN, Letter), frame only plus ours text rendered separately above.
const official = (
	JSON.parse(readFileSync('tests/fixtures/official-layout.json', 'utf8')) as {
		pages: Awaited<ReturnType<typeof extractGeometry>>;
	}
).pages;
const ours = await extractGeometry(
	await renderTeamSheet(player, team, { lang: 'en', fonts, pageSize: 'letter' })
);
const RES = 2;
for (let i = 0; i < 2; i++) {
	const a = rasterizeRects(official[i], RES);
	const b = rasterizeRects(ours[i], RES);
	const w = Math.ceil(official[i].width * RES);
	const h = Math.ceil(official[i].height * RES);
	const canvas = createCanvas(w, h);
	const ctx = canvas.getContext('2d');
	const img = ctx.createImageData(w, h);
	for (let p = 0; p < a.length; p++) {
		const o = a[p];
		const u = b[p];
		const rgb = o && u ? [0, 0, 0] : o ? [230, 40, 40] : u ? [40, 80, 255] : [255, 255, 255];
		img.data.set([...rgb, 255], p * 4);
	}
	ctx.putImageData(img, 0, 0);
	writeFileSync(`${out}/overlay-${i + 1}.png`, canvas.toBuffer('image/png'));
}
console.log('written to', out);
