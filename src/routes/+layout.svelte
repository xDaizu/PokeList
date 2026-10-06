<script lang="ts">
	import { page } from '$app/state';
	import { locales, localizeHref, getLocale } from '#lib/paraglide/runtime.js';
	import { m } from '#lib/paraglide/messages.js';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const current = $derived(getLocale());
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header>
	<span class="wordmark">{m.app_name()}</span>
	<nav aria-label={m.language_label()}>
		{#each locales as locale (locale)}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- localizeHref already includes the base path -->
			<a
				href={localizeHref(page.url.pathname, { locale })}
				hreflang={locale}
				aria-current={locale === current ? 'true' : undefined}
				data-sveltekit-reload
			>
				{locale === 'en' ? m.language_en() : m.language_es()}
			</a>
		{/each}
	</nav>
</header>

<main>
	{@render children()}
</main>

<footer>{m.footer_disclaimer()}</footer>

<style>
	:global(body) {
		margin: 0;
		font-family: system-ui, sans-serif;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: #5a55c4;
		color: #fff;
	}
	.wordmark {
		font-weight: 800;
		font-size: 1.25rem;
	}
	nav {
		display: flex;
		gap: 0.75rem;
	}
	nav a {
		color: #fff;
		opacity: 0.8;
	}
	nav a[aria-current='true'] {
		opacity: 1;
		font-weight: 700;
	}
	main {
		padding: 1.5rem 1rem;
		max-width: 60rem;
		margin: 0 auto;
	}
	footer {
		padding: 1rem;
		font-size: 0.8rem;
		text-align: center;
		opacity: 0.7;
	}
</style>
