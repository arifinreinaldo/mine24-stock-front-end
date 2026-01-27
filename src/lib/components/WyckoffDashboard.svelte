<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { WyckoffPhase } from '$lib/server/db/schema';
  import type { StockRecommendation } from '$lib/server/analysis/recommendation';
  import StockCard from './StockCard.svelte';
  import RecommendationWidget from './RecommendationWidget.svelte';

  interface StockData {
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
    recommendation: StockRecommendation | null;
  }

  export let stocks: StockData[] = [];

  const dispatch = createEventDispatcher<{ delete: { symbol: string } }>();

  function handleDelete(event: CustomEvent<{ symbol: string }>) {
    dispatch('delete', event.detail);
  }

  // Get top buy recommendations (sorted by confidence)
  $: topBuyRecommendations = stocks
    .filter(s => s.recommendation && (s.recommendation.action === 'STRONG_BUY' || s.recommendation.action === 'BUY'))
    .sort((a, b) => (b.recommendation?.confidence || 0) - (a.recommendation?.confidence || 0))
    .slice(0, 3);

  // Expand/collapse state for recommendations
  let expandedRecommendation: string | null = null;

  function toggleRecommendation(symbol: string) {
    expandedRecommendation = expandedRecommendation === symbol ? null : symbol;
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
    <!-- Top Buy Recommendations Section -->
    {#if topBuyRecommendations.length > 0}
      <section class="border rounded-lg border-green-700 bg-green-900/10">
        <div class="px-4 py-3 border-b border-green-700/30">
          <div class="flex items-center gap-2">
            <span class="text-xl">&#127919;</span>
            <h2 class="text-lg font-semibold text-green-400">Top Buy Recommendations</h2>
            <span class="text-sm text-green-400/70">({topBuyRecommendations.length})</span>
          </div>
          <p class="text-sm text-green-400/70 mt-1">Stocks with strongest buy signals based on multiple factors</p>
        </div>

        <div class="p-4 space-y-4">
          {#each topBuyRecommendations as stock (stock.symbol)}
            <div class="border border-green-700/30 rounded-lg overflow-hidden">
              <!-- Clickable Header -->
              <button
                on:click={() => toggleRecommendation(stock.symbol)}
                class="w-full px-4 py-3 flex items-center justify-between bg-green-900/20 hover:bg-green-900/30 transition-colors text-left"
              >
                <div class="flex items-center gap-3">
                  <span class="text-lg font-bold text-white">{stock.symbol.replace('.JK', '')}</span>
                  {#if stock.recommendation}
                    <span class="px-2 py-0.5 text-xs font-bold rounded {stock.recommendation.action === 'STRONG_BUY' ? 'bg-green-500 text-white' : 'bg-green-500/50 text-green-100'}">
                      {stock.recommendation.action === 'STRONG_BUY' ? 'Strong Buy' : 'Buy'}
                    </span>
                  {/if}
                  <span class="text-sm text-gray-400">{stock.name}</span>
                </div>
                <div class="flex items-center gap-4">
                  <div class="text-right">
                    <span class="text-lg font-semibold text-white">{stock.price.toLocaleString('id-ID')}</span>
                    <span class="ml-2 text-sm {stock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}">
                      {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                    </span>
                  </div>
                  <svg
                    class="w-5 h-5 text-gray-400 transition-transform {expandedRecommendation === stock.symbol ? 'rotate-180' : ''}"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              <!-- Expandable Recommendation Details -->
              {#if expandedRecommendation === stock.symbol && stock.recommendation}
                <div class="p-4 border-t border-green-700/30">
                  <RecommendationWidget
                    recommendation={stock.recommendation}
                    symbol={stock.symbol}
                    currentPrice={stock.price}
                  />
                  <div class="mt-3 text-center">
                    <a
                      href="/stock/{stock.symbol}"
                      class="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      View Full Analysis
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </a>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}

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
                recommendation={stock.recommendation}
                on:delete={handleDelete}
              />
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </div>
{/if}
