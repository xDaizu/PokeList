import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// Dev-only review page for the PDF renderer; it is never linked from the app or prerendered.
export const load: PageLoad = () => {
	if (!import.meta.env.DEV) error(404, 'Not found');
};
