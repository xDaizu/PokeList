<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { baseLocale, isLocale, localizeHref } from '#lib/paraglide/runtime.js';
	import { m } from '#lib/paraglide/messages.js';

	const STORAGE_KEY = 'pokelisto:v1:lang';

	function preferredLocale() {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored && isLocale(stored)) return stored;
		} catch {
			// storage unavailable (private mode); fall through to browser language
		}
		const browser = navigator.language.slice(0, 2).toLowerCase();
		return isLocale(browser) ? browser : baseLocale;
	}

	// The same page serves `/`, `/en/` and `/es/`; only the unprefixed root redirects.
	onMount(() => {
		const hasPrefix = /^\/(en|es)\//.test(page.url.pathname.slice(resolve('/').length - 1));
		if (!hasPrefix) {
			// localizeHref already includes the base path
			void goto(localizeHref(resolve('/'), { locale: preferredLocale() }), {
				replaceState: true
			});
		}
	});
</script>

<svelte:head>
	<title>{m.app_name()} — {m.home_heading()}</title>
</svelte:head>

<h1>{m.home_heading()}</h1>
<p>{m.home_tagline()}</p>
