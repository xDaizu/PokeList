import { expect, test } from '@playwright/test';

test('/en/ renders the English heading', async ({ page }) => {
	await page.goto('en/');
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.locator('h1')).toHaveText('Build your VGC team sheet');
});

test('/es/ renders the Spanish heading', async ({ page }) => {
	await page.goto('es/');
	await expect(page.locator('html')).toHaveAttribute('lang', 'es');
	await expect(page.locator('h1')).toHaveText('Crea tu hoja de equipo VGC');
});

test('language switch navigates between locales', async ({ page }) => {
	await page.goto('en/');
	await page.getByRole('link', { name: 'Español' }).click();
	await expect(page).toHaveURL(/\/es\/$/);
	await expect(page.locator('h1')).toHaveText('Crea tu hoja de equipo VGC');
});

test.describe('root redirect', () => {
	test.use({ locale: 'es-ES' });
	test('Spanish browser lands on /es/', async ({ page }) => {
		await page.goto('');
		await expect(page).toHaveURL(/\/es\/$/);
	});
});

test.describe('root redirect (other languages)', () => {
	test.use({ locale: 'fr-FR' });
	test('unsupported language falls back to /en/', async ({ page }) => {
		await page.goto('');
		await expect(page).toHaveURL(/\/en\/$/);
	});
});
