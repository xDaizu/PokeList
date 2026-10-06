import { defineConfig } from '@playwright/test';

// Set BASE_PATH (e.g. /PokeList) to run the suite against a GH Pages-style build.
const base = process.env.BASE_PATH ?? '';

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	use: { baseURL: `http://localhost:4173${base}/` },
	testDir: 'tests/e2e',
	testMatch: '**/*.e2e.{ts,js}'
});
