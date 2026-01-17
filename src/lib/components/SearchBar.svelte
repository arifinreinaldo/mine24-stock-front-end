<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let isLoading = false;

  const dispatch = createEventDispatcher<{
    search: { symbol: string };
  }>();

  let query = '';
  let suggestions: { symbol: string; name: string }[] = [];
  let showSuggestions = false;
  let searchTimeout: ReturnType<typeof setTimeout>;
  let selectedIndex = -1;

  async function fetchSuggestions(q: string) {
    if (q.length < 2) {
      suggestions = [];
      return;
    }

    try {
      const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        suggestions = await res.json();
        showSuggestions = suggestions.length > 0;
      }
    } catch (e) {
      console.error('Search error:', e);
    }
  }

  function handleInput() {
    clearTimeout(searchTimeout);
    selectedIndex = -1;
    searchTimeout = setTimeout(() => fetchSuggestions(query), 300);
  }

  function handleSelect(symbol: string) {
    query = '';
    suggestions = [];
    showSuggestions = false;
    selectedIndex = -1;
    dispatch('search', { symbol });
  }

  function handleSubmit() {
    if (selectedIndex >= 0 && suggestions[selectedIndex]) {
      handleSelect(suggestions[selectedIndex].symbol);
    } else if (query.trim()) {
      handleSelect(query.trim().toUpperCase());
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!showSuggestions) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        break;
      case 'Escape':
        showSuggestions = false;
        selectedIndex = -1;
        break;
    }
  }

  function handleBlur() {
    // Delay to allow click on suggestion
    setTimeout(() => {
      showSuggestions = false;
    }, 200);
  }
</script>

<div class="relative">
  <form on:submit|preventDefault={handleSubmit} class="relative">
    <input
      type="text"
      bind:value={query}
      on:input={handleInput}
      on:focus={() => suggestions.length > 0 && (showSuggestions = true)}
      on:blur={handleBlur}
      on:keydown={handleKeydown}
      placeholder="Search Indonesian stocks (e.g., BBCA, BBRI, TLKM)..."
      class="input pr-12"
      disabled={isLoading}
    />
    <button
      type="submit"
      class="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-200 transition-colors"
      disabled={isLoading}
    >
      {#if isLoading}
        <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      {:else}
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      {/if}
    </button>
  </form>

  {#if showSuggestions && suggestions.length > 0}
    <ul class="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
      {#each suggestions as suggestion, i}
        <li>
          <button
            type="button"
            class="w-full px-4 py-3 text-left hover:bg-slate-700 transition-colors flex items-center justify-between {selectedIndex === i ? 'bg-slate-700' : ''}"
            on:mousedown={() => handleSelect(suggestion.symbol)}
          >
            <span class="font-medium text-slate-100">{suggestion.symbol}</span>
            <span class="text-sm text-slate-400 truncate ml-2">{suggestion.name}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
