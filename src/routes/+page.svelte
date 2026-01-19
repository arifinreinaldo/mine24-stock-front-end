<script lang="ts">
  import SearchBar from '$lib/components/SearchBar.svelte';
  import WyckoffDashboard from '$lib/components/WyckoffDashboard.svelte';
  import type { PageData } from './$types';
  import { invalidateAll } from '$app/navigation';
  import { sessionStore } from '$lib/stores/session';

  export let data: PageData;

  let isSearching = false;
  let isRefreshing = false;
  let isClearing = false;

  async function handleSearch(event: CustomEvent<{ symbol: string }>) {
    const { symbol } = event.detail;
    isSearching = true;

    try {
      const sessionId = sessionStore.get();
      const res = await fetch('/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ symbol, sessionId }),
        credentials: 'same-origin'
      });

      if (res.ok) {
        // Refresh the page data to show the new stock
        await invalidateAll();
      } else {
        const error = await res.json();
        console.error('Search error:', error);
        alert(error.message || 'Failed to search stock');
      }
    } catch (e) {
      console.error('Search error:', e);
      alert('Failed to search stock');
    } finally {
      isSearching = false;
    }
  }

  async function handleRefresh() {
    if (isRefreshing || data.stocks.length === 0) return;
    isRefreshing = true;

    try {
      const res = await fetch('/api/stocks/refresh', {
        method: 'POST',
        credentials: 'same-origin'
      });

      if (res.ok) {
        const result = await res.json();
        console.log('Refresh result:', result);
        await invalidateAll();
      } else {
        const error = await res.json();
        console.error('Refresh error:', error);
        alert(error.message || 'Failed to refresh stocks');
      }
    } catch (e) {
      console.error('Refresh error:', e);
      alert('Failed to refresh stocks');
    } finally {
      isRefreshing = false;
    }
  }

  async function handleClear(clearAll: boolean = false) {
    if (isClearing || data.stocks.length === 0) return;

    const confirmMsg = clearAll
      ? 'This will remove all stocks from your watchlist and delete all their data. Continue?'
      : 'This will clear all historical data but keep your watchlist. Continue?';

    if (!confirm(confirmMsg)) return;

    isClearing = true;

    try {
      const url = clearAll ? '/api/stocks/clear?all=true' : '/api/stocks/clear';
      const res = await fetch(url, {
        method: 'DELETE',
        credentials: 'same-origin'
      });

      if (res.ok) {
        const result = await res.json();
        console.log('Clear result:', result);
        await invalidateAll();
      } else {
        const error = await res.json();
        console.error('Clear error:', error);
        alert(error.message || 'Failed to clear data');
      }
    } catch (e) {
      console.error('Clear error:', e);
      alert('Failed to clear data');
    } finally {
      isClearing = false;
    }
  }
</script>

<svelte:head>
  <title>Mine24 Stock Dashboard - Indonesian Equity Wyckoff Analysis</title>
</svelte:head>

<div class="space-y-8">
  <section class="max-w-2xl mx-auto">
    <SearchBar on:search={handleSearch} isLoading={isSearching} />
  </section>

  {#if data.stocks.length > 0}
    <section class="flex flex-wrap items-center justify-center gap-3">
      <button
        on:click={handleRefresh}
        disabled={isRefreshing || isClearing}
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
      >
        {#if isRefreshing}
          <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Refreshing...
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh All Prices
        {/if}
      </button>

      <button
        on:click={() => handleClear(false)}
        disabled={isRefreshing || isClearing}
        class="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
      >
        {#if isClearing}
          <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Clearing...
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          Clear Cache
        {/if}
      </button>

      <button
        on:click={() => handleClear(true)}
        disabled={isRefreshing || isClearing}
        class="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Clear All
      </button>
    </section>
  {/if}

  <WyckoffDashboard stocks={data.stocks} />
</div>
