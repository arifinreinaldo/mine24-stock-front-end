<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { WyckoffPhase } from '$lib/server/db/schema';
  import WyckoffBadge from './WyckoffBadge.svelte';

  export let symbol: string;
  export let name: string = '';
  export let price: number;
  export let change: number;
  export let changePercent: number;
  export let phase: WyckoffPhase;
  export let subPhase: string | null = null;
  export let strength: number;
  export let targetPrice: number;
  export let cutLossPrice: number;

  const dispatch = createEventDispatcher<{ delete: { symbol: string } }>();

  let isDeleting = false;

  function handleDelete(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isDeleting) return;
    dispatch('delete', { symbol });
  }

  $: isPositive = change >= 0;
  $: changeClass = isPositive ? 'price-up' : 'price-down';

  // Determine if this is a bullish (long) or bearish (short) phase
  $: isLongPosition = phase === 'accumulation' || phase === 'markup';

  // Format price for Indonesian Rupiah (no decimals, with thousands separator)
  function formatPrice(p: number): string {
    return new Intl.NumberFormat('id-ID').format(Math.round(p));
  }

  // Format percentage
  function formatPercent(p: number): string {
    const sign = p >= 0 ? '+' : '';
    return `${sign}${p.toFixed(2)}%`;
  }

  // Calculate potential gain/loss based on position type
  $: potentialGain = isLongPosition
    ? ((targetPrice - price) / price) * 100
    : ((price - targetPrice) / price) * 100; // For short: gain when price drops

  $: potentialLoss = isLongPosition
    ? ((price - cutLossPrice) / price) * 100
    : ((cutLossPrice - price) / price) * 100; // For short: loss when price rises
</script>

<a
  href="/stock/{symbol}"
  class="card-hover block group relative"
>
  <!-- Delete button -->
  <button
    on:click={handleDelete}
    class="absolute top-2 right-2 p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all z-10"
    title="Remove from watchlist"
  >
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>

  <div class="flex items-start justify-between mb-3">
    <div>
      <h3 class="font-semibold text-lg text-slate-100 group-hover:text-blue-400 transition-colors">
        {symbol.replace('.JK', '')}
      </h3>
      {#if name}
        <p class="text-sm text-slate-400 truncate max-w-[180px]">{name}</p>
      {/if}
    </div>
    <WyckoffBadge {phase} {subPhase} size="sm" />
  </div>

  <div class="flex items-end justify-between mb-3">
    <div>
      <span class="text-2xl font-bold text-slate-100">{formatPrice(price)}</span>
      <span class="ml-2 {changeClass} text-sm font-medium">
        {formatPercent(changePercent)}
      </span>
    </div>
    <div class="text-right">
      <div class="text-xs text-slate-500">Strength</div>
      <div class="text-sm font-medium text-slate-300">{strength.toFixed(0)}%</div>
    </div>
  </div>

  <div class="pt-3 border-t border-slate-700">
    <!-- Position type indicator -->
    <div class="flex items-center gap-1.5 mb-2">
      {#if isLongPosition}
        <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">LONG</span>
        <span class="text-[10px] text-slate-500" title="Buy and hold - profit when price rises">Buy recommendation</span>
      {:else}
        <span class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">SHORT</span>
        <span class="text-[10px] text-slate-500" title="Sell/avoid - profit when price falls">Sell recommendation</span>
      {/if}
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <div
          class="text-xs text-slate-500 mb-1 cursor-help"
          title={isLongPosition
            ? "Target price to take profit on long position"
            : "Expected price drop target for short position"}
        >
          {isLongPosition ? 'Target' : 'Downside Target'}
        </div>
        <div class="text-sm font-medium {isLongPosition ? 'text-emerald-400' : 'text-amber-400'}">
          {formatPrice(targetPrice)}
          <span class="text-xs text-slate-500">(+{potentialGain.toFixed(1)}%)</span>
        </div>
      </div>
      <div>
        <div
          class="text-xs text-slate-500 mb-1 cursor-help"
          title={isLongPosition
            ? "Exit price if trade goes against you"
            : "Exit price if price rises against short position"}
        >
          {isLongPosition ? 'Cut Loss' : 'Stop Loss'}
        </div>
        <div class="text-sm font-medium text-red-400">
          {formatPrice(cutLossPrice)}
          <span class="text-xs text-slate-500">(-{potentialLoss.toFixed(1)}%)</span>
        </div>
      </div>
    </div>
  </div>
</a>
