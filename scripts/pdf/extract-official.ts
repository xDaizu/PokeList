/**
 * Measures the official team list and writes its frame/text geometry to a JSON fixture.
 * Run: npx tsx scripts/pdf/extract-official.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { extractGeometry } from '../../src/lib/pdf/test-helpers.ts';

const pages = await extractGeometry(
	new Uint8Array(readFileSync('docs/play-pokemon-vg-team-list.pdf'))
);
writeFileSync('tests/fixtures/official-layout.json', JSON.stringify({ pages }, null, '\t') + '\n');
console.log(pages.map((p) => `${p.rects.length} rects, ${p.texts.length} texts`).join(' | '));
