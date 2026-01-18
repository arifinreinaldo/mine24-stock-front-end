<script lang="ts">
  import SearchBar from '$lib/components/SearchBar.svelte';
  import WyckoffDashboard from '$lib/components/WyckoffDashboard.svelte';
  import type { PageData } from './$types';
  import { invalidateAll } from '$app/navigation';
  import { sessionStore } from '$lib/stores/session';

  export let data: PageData;

  let isSearching = false;

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
</script>

<svelte:head>
  <title>Mine24 Stock Dashboard - Indonesian Equity Wyckoff Analysis</title>
</svelte:head>

<div class="space-y-8">
  <section class="max-w-2xl mx-auto">
    <SearchBar on:search={handleSearch} isLoading={isSearching} />
  </section>

  <WyckoffDashboard stocks={data.stocks} />
</div>
