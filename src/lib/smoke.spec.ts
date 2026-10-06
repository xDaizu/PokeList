import { describe, expect, it } from 'vitest';
import { baseLocale, locales } from '#lib/paraglide/runtime.js';

describe('i18n setup', () => {
	it('supports English and Spanish with English as base', () => {
		expect([...locales]).toEqual(['en', 'es']);
		expect(baseLocale).toBe('en');
	});
});
