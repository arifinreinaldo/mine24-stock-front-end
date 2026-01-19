<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { WyckoffPhase } from '$lib/server/db/schema';
  import StockCard from './StockCard.svelte';

  export interface StockData {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    phase: WyckoffPhase;
    subPhase: string | null;
    strength: number;
    targetPrice: number;
    cutLossPrice: number;
  }

  export let stocks: StockData[] = [];

  const dispatch = createEventDispatcher<{ delete: { symbol: string } }>();

  function handleDelete(event: CustomEvent<{ symbol: string }>) {
    dispatch('delete', event.detail);
  }

  // Group stocks by phase
  $: stocksByPhase = {
    accumulation: stocks
      .filter((s) => s.phase === 'accumulation')
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 10),
    markup: stocks
      .filter((s) => s.phase === 'markup')
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 10),
    distribution: stocks
      .filter((s) => s.phase === 'distribution')
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 10),
    markdown: stocks
      .filter((s) => s.phase === 'markdown')
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 10)
  };

  const phaseConfig: Record<WyckoffPhase, { title: string; description: string; positionHint: string; color: string; icon: string }> = {
    accumulation: {
      title: 'Accumulation',
      description: 'Smart money buying, price consolidating at lows',
      positionHint: 'Long position - buy opportunity',
      color: 'text-emerald-400 border-emerald-700 bg-emerald-900/20',
      icon: '📦'
    },
    markup: {
      title: 'Markup',
      description: 'Uptrend phase, price rising',
      positionHint: 'Long position - hold or buy dips',
      color: 'text-blue-400 border-blue-700 bg-blue-900/20',
      icon: '📈'
    },
    distribution: {
      title: 'Distribution',
      description: 'Smart money selling, price consolidating at highs',
      positionHint: 'Short position - take profit or avoid buying',
      color: 'text-amber-400 border-amber-700 bg-amber-900/20',
      icon: '📤'
    },
    markdown: {
      title: 'Markdown',
      description: 'Downtrend phase, price falling',
      positionHint: 'Short position - avoid or sell',
      color: 'text-red-400 border-red-700 bg-red-900/20',
      icon: '📉'
    }
  };

  const phases: WyckoffPhase[] = ['accumulation', 'markup', 'distribution', 'markdown'];
</script>

{#if stocks.length === 0}
  <div class="text-center py-16">
    <div class="text-6xl mb-4">🔍</div>
    <h2 class="text-xl font-semibold text-slate-300 mb-2">No stocks in your watchlist yet</h2>
    <p class="text-slate-500">Search for Indonesian stocks above to add them to your watchlist.</p>
    <p class="text-slate-500 mt-1">They will be analyzed and categorized by Wyckoff phase.</p>
  </div>
{:else}
  <div class="space-y-8">
    {#each phases as phase}
      {@const phaseStocks = stocksByPhase[phase]}
      {@const config = phaseConfig[phase]}

      <section class="border rounded-lg {config.color}">
        <div class="px-4 py-3 border-b border-current/20">
          <div class="flex items-center gap-2">
            <span class="text-xl">{config.icon}</span>
            <h2 class="text-lg font-semibold">{config.title}</h2>
            <span class="text-sm opacity-70">({phaseStocks.length})</span>
          </div>
          <p class="text-sm opacity-70 mt-1">{config.description}</p>
          <p class="text-xs mt-1 font-medium" title="Recommended position type for this phase">{config.positionHint}</p>
        </div>

        {#if phaseStocks.length === 0}
          <div class="px-4 py-8 text-center opacity-50">
            <p>No stocks in this phase</p>
          </div>
        {:else}
          <div class="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {#each phaseStocks as stock (stock.symbol)}
              <StockCard
                symbol={stock.symbol}
                name={stock.name}
                price={stock.price}
                change={stock.change}
                changePercent={stock.changePercent}
                phase={stock.phase}
                subPhase={stock.subPhase}
                strength={stock.strength}
                targetPrice={stock.targetPrice}
                cutLossPrice={stock.cutLossPrice}
                on:delete={handleDelete}
              />
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </div>
{/if}
