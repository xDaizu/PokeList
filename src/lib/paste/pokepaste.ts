export type PokepasteErrorCode = 'invalidUrl' | 'notFound' | 'http' | 'network';

export type PokepasteResult =
	{ ok: true; id: string; title: string; text: string } | { ok: false; code: PokepasteErrorCode };

/** Extracts the paste id from "https://pokepast.es/<id>[/...]" or a bare id. */
export function parsePokepasteId(input: string): string | undefined {
	const text = input.trim();
	const m = /^(?:https?:\/\/)?(?:www\.)?pokepast\.es\/([0-9a-z]+)(?:[/?#].*)?$/i.exec(text);
	if (m) return m[1].toLowerCase();
	return /^[0-9a-f]{8,}$/i.test(text) ? text.toLowerCase() : undefined;
}

/**
 * Fetches a paste's raw text via pokepast.es's JSON endpoint. Browsers surface a CORS block as a
 * network failure (`TypeError`), reported as `network` so the UI can ask the user to paste the text.
 */
export async function fetchPokepaste(
	input: string,
	fetchImpl: typeof fetch = fetch
): Promise<PokepasteResult> {
	const id = parsePokepasteId(input);
	if (!id) return { ok: false, code: 'invalidUrl' };

	let res: Response;
	try {
		res = await fetchImpl(`https://pokepast.es/${id}/json`);
	} catch {
		return { ok: false, code: 'network' };
	}
	if (res.status === 404) return { ok: false, code: 'notFound' };
	if (!res.ok) return { ok: false, code: 'http' };

	try {
		const json = (await res.json()) as { title?: unknown; paste?: unknown };
		if (typeof json.paste !== 'string') return { ok: false, code: 'http' };
		return {
			ok: true,
			id,
			title: typeof json.title === 'string' ? json.title : '',
			text: json.paste
		};
	} catch {
		return { ok: false, code: 'http' };
	}
}
