import regularUrl from '@fontsource/carlito/files/carlito-latin-400-normal.woff?url';
import boldUrl from '@fontsource/carlito/files/carlito-latin-700-normal.woff?url';
import boldItalicUrl from '@fontsource/carlito/files/carlito-latin-700-italic.woff?url';
import type { SheetFonts } from './render.js';

/**
 * Carlito (OFL, metric-compatible with the Calibri of the official template), fetched only when a PDF
 * is generated so it never weighs on the initial page load.
 */
export async function loadSheetFonts(fetchFn: typeof fetch = fetch): Promise<SheetFonts> {
	const get = async (url: string) => new Uint8Array(await (await fetchFn(url)).arrayBuffer());
	const [regular, bold, boldItalic] = await Promise.all([
		get(regularUrl),
		get(boldUrl),
		get(boldItalicUrl)
	]);
	return { regular, bold, boldItalic };
}
