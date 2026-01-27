<script lang="ts">
  import SearchBar from '$lib/components/SearchBar.svelte';
  import WyckoffDashboard from '$lib/components/WyckoffDashboard.svelte';
  import type { PageData } from './$types';
  import { invalidateAll } from '$app/navigation';

  export let data: PageData;

  let isSearching = false;
  let isRefreshing = false;
  let isClearing = false;
  let deletingSymbol: string | null = null;

  $: stocks = data.stocks;
  $: jci = data.jci;
  $: marketBreadth = data.marketBreadth;

  function getPhaseColor(phase: string): string {
    switch (phase) {
      case 'accumulation':
        return 'bg-green-500';
      case 'markup':
        return 'bg-blue-500';
      case 'distribution':
        return 'bg-yellow-500';
      case 'markdown':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  }

  function getPhaseLabel(phase: string): string {
    return phase.charAt(0).toUpperCase() + phase.slice(1);
  }

  async function handleDelete(event: CustomEvent<{ symbol: string }>) {
    const { symbol } = event.detail;
    if (deletingSymbol) return;

    deletingSymbol = symbol;

    try {
      const res = await fetch(`/api/stocks/${encodeURIComponent(symbol)}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });

      if (res.ok) {
        await invalidateAll();
      } else {
        const error = await res.json();
        console.error('Delete error:', error);
        alert(error.message || 'Failed to delete stock');
      }
    } catch (e) {
      console.error('Delete error:', e);
      alert('Failed to delete stock');
    } finally {
      deletingSymbol = null;
    }
  }

  async function handleSearch(event: CustomEvent<{ symbol: string }>) {
    const { symbol } = event.detail;
    isSearching = true;

    try {
      const res = await fetch('/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ symbol }),
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
    if (isRefreshing || stocks.length === 0) return;
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
    if (isClearing || stocks.length === 0) return;

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

  <!-- JCI Index Card -->
  {#if jci}
    <section class="max-w-2xl mx-auto">
      <a
        href="/stock/{encodeURIComponent(jci.symbol)}"
        class="block bg-gradient-to-r from-blue-900 to-blue-700 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all hover:scale-[1.01]"
      >
        <div class="flex items-center justify-between">
          <div>
            <div class="flex items-center gap-3 mb-2">
              <h2 class="text-2xl font-bold text-white">JCI Index</h2>
              <span class="px-2 py-1 text-xs font-medium rounded-full {getPhaseColor(jci.phase)} text-white">
                {getPhaseLabel(jci.phase)}
              </span>
            </div>
            <p class="text-blue-200 text-sm">{jci.symbol} - {jci.name}</p>
          </div>
          <div class="text-right">
            <p class="text-3xl font-bold text-white">
              {jci.price.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p class="text-lg font-medium {jci.changePercent >= 0 ? 'text-green-300' : 'text-red-300'}">
              {jci.changePercent >= 0 ? '+' : ''}{jci.changePercent.toFixed(2)}%
              <span class="text-sm">
                ({jci.change >= 0 ? '+' : ''}{jci.change.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
              </span>
            </p>
          </div>
        </div>
      </a>
    </section>
  {/if}

  <!-- Market Breadth Widget -->
  {#if marketBreadth && marketBreadth.total > 0}
    <section class="max-w-2xl mx-auto">
      <div class="bg-gray-800 rounded-xl p-5 shadow-lg">
        <h3 class="text-lg font-semibold text-white mb-4">Market Breadth (MA200)</h3>
        <div class="space-y-3">
          <!-- Progress Bar -->
          <div class="relative h-6 bg-gray-700 rounded-full overflow-hidden">
            <div
              class="absolute left-0 top-0 h-full bg-green-500 transition-all"
              style="width: {marketBreadth.percentAbove}%"
            />
            <div
              class="absolute right-0 top-0 h-full bg-red-500 transition-all"
              style="width: {100 - marketBreadth.percentAbove}%"
            />
            <div class="absolute inset-0 flex items-center justify-center">
              <span class="text-sm font-bold text-white drop-shadow-md">
                {marketBreadth.percentAbove}% Bullish
              </span>
            </div>
          </div>

          <!-- Stats -->
          <div class="flex justify-between text-sm">
            <div class="flex items-center gap-2">
              <span class="w-3 h-3 bg-green-500 rounded-full"></span>
              <span class="text-gray-300">
                Above MA200: <span class="font-semibold text-green-400">{marketBreadth.aboveMA200}</span>
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-gray-300">
                Below MA200: <span class="font-semibold text-red-400">{marketBreadth.belowMA200}</span>
              </span>
              <span class="w-3 h-3 bg-red-500 rounded-full"></span>
            </div>
          </div>

          {#if marketBreadth.noData > 0}
            <p class="text-xs text-gray-500 text-center">
              {marketBreadth.noData} stock{marketBreadth.noData > 1 ? 's' : ''} with insufficient data
            </p>
          {/if}
        </div>
      </div>
    </section>
  {/if}

  {#if stocks.length > 0}
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

  <WyckoffDashboard {stocks} on:delete={handleDelete} />
</div>
