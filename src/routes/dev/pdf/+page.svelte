<script lang="ts">
	import { onMount } from 'svelte';
	import type { Lang } from '#lib/data/index.js';
	import { emptyPlayer, type Member, type Player, type Team } from '#lib/model/types.js';
	import { loadSheetFonts } from '#lib/pdf/fonts.js';
	import { renderTeamSheet, sheetFilename, type PageSize } from '#lib/pdf/render.js';
	import members from '../../../../tests/fixtures/sahil.members.json';

	const team: Team = {
		id: 'fixture',
		name: 'Sahil',
		regulationId: 'M-C',
		members: members as Member[],
		updatedAt: 0
	};
	const player: Player = {
		...emptyPlayer(),
		name: 'Sahil Example',
		trainerName: 'Sahil',
		playerId: '1234567',
		dob: '7/3/1998',
		division: 'masters',
		switchProfile: 'SahilVGC',
		supportId: 'ABC123',
		battleTeam: 'Team 1'
	};

	let lang = $state<Lang>('en');
	let pageSize = $state<PageSize>('a4');
	let url = $state('');
	let error = $state('');
	let mounted = $state(false);

	onMount(() => {
		mounted = true;
	});

	$effect(() => {
		if (!mounted) return;
		let cancelled = false;
		let objectUrl = '';
		void (async () => {
			try {
				const bytes = await renderTeamSheet(player, team, {
					lang,
					pageSize,
					fonts: await loadSheetFonts()
				});
				if (cancelled) return;
				objectUrl = URL.createObjectURL(
					new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
				);
				url = objectUrl;
				error = '';
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
			}
		})();
		return () => {
			cancelled = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	});
</script>

<svelte:head>
	<title>PDF preview (dev)</title>
</svelte:head>

<h1>PDF preview (dev only)</h1>
<p>Renders the Sahil fixture team. Compare with <code>docs/play-pokemon-vg-team-list.pdf</code>.</p>

<form class="controls">
	<label>
		Language
		<select bind:value={lang}>
			<option value="en">English</option>
			<option value="es">Español</option>
		</select>
	</label>
	<label>
		Page size
		<select bind:value={pageSize}>
			<option value="a4">A4</option>
			<option value="letter">Letter (official size)</option>
		</select>
	</label>
	{#if url}
		<a href={url} download={sheetFilename(player)}>Download</a>
	{/if}
</form>

{#if error}
	<p role="alert">{error}</p>
{/if}
{#if url}
	<iframe title="Team list PDF" src={url}></iframe>
{/if}

<style>
	.controls {
		display: flex;
		gap: 1rem;
		align-items: center;
		margin-bottom: 1rem;
	}
	iframe {
		width: 100%;
		height: 80vh;
		border: 1px solid #888;
	}
</style>
