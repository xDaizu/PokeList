# Svelte 5 & SvelteKit Guidelines

You are an expert Svelte and SvelteKit engineer. Always write code targeting Svelte 5 and SvelteKit.

---

## 1. Critical Syntax Rules (Svelte 5 Runes)

Never use deprecated Svelte 3/4 syntax. Strictly adhere to Svelte 5 Runes:

### State and Reactivity

- **DO NOT** use `let count = 0` for reactive state.
- **DO NOT** use `$: double = count * 2` reactive declarations.
- **USE** `$state()`:
  ```svelte
  <script lang="ts">
  	let count = $state(0);
  	let items = $state<string[]>([]);
  </script>
  ```
- **USE** `$derived()` for computed state:
  ```svelte
  <script lang="ts">
  	let count = $state(0);
  	let doubled = $derived(count * 2);
  </script>
  ```
- **USE** `$derived.by()` when computation requires complex logic or multi-step blocks:
  ```svelte
  let filtered = $derived.by(() => {
    return items.filter(item => item.active);
  });
  ```
- **USE** `$effect()` instead of `$:` blocks for side effects. Keep effects minimal and avoid updating primary state inside `$effect` unless synchronizing with external APIs or DOM:
  ```svelte
  $effect(() => {
    console.log('Count changed:', count);
  });
  ```

### Props

- **DO NOT** use `export let propName;`.
- **USE** `$props()` with TypeScript destructuring and defaults:
  ```svelte
  <script lang="ts">
  	interface Props {
  		title: string;
  		count?: number;
  		children?: import('svelte').Snippet;
  	}

  	let { title, count = 0, children }: Props = $props();
  </script>
  ```

### Slots vs Snippets

- **DO NOT** use `<slot />` or named slots `<slot name="..." />`.
- **USE** Snippets (`{#snippet ...}`) and render them using `{@render ...}`:
  ```svelte
  <!-- In parent or component -->
  {#snippet header(text)}
  	<h2>{text}</h2>
  {/snippet}

  {@render header('Welcome')}

  <!-- Rendering passed children -->
  {#if children}
  	{@render children()}
  {/if}
  ```

### Event Handling

- **DO NOT** use `on:click={handleClick}` or `createEventDispatcher`.
- **USE** standard HTML attributes with callback props (`onclick={handleClick}`, `onsubmit={...}`):
  ```svelte
  <button onclick={() => count++}>Increment</button>
  ```
- For component events, accept callbacks via `$props()` (e.g., `let { onSelect }: { onSelect: (id: string) => void } = $props();`).

---

## 2. SvelteKit Structure & Best Practices

- Follow file-based routing strictly:
  - `+page.svelte` for UI components.
  - `+page.server.ts` for server-only loaders and form actions.
  - `+page.ts` for universal client/server loads.
  - `+server.ts` for standalone REST/JSON API endpoints.
  - `+layout.svelte` for shared wrappers and layouts.
- **Data Loading:** Access page data via `$props()`:
  ```svelte
  <script lang="ts">
  	import type { PageProps } from './$types';
  	let { data }: PageProps = $props();
  </script>
  ```
- **Form Actions:** Prefer SvelteKit native form actions (`enhance` from `$app/forms`) over manual `fetch` calls for form submissions.
- **Navigation:** Use `goto()` from `$app/navigation` or native `<a href="...">` tags. Do not manipulate `window.location` directly.

---

## 3. Code Quality & Conventions

- Use TypeScript (`lang="ts"`) for all `<script>` tags.
- Keep components concise. Separate logic into shared `.svelte.ts` files when using reactive state outside of components (runes are valid in `.svelte.ts` files).
- Keep styles scoped within the `<style>` tag of the component or use utility CSS (Tailwind) if configured.
