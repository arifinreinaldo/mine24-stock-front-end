<script lang="ts">
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

  $: isPositive = change >= 0;
  $: changeClass = isPositive ? 'price-up' : 'price-down';

  // Format price for Indonesian Rupiah (no decimals, with thousands separator)
  function formatPrice(p: number): string {
    return new Intl.NumberFormat('id-ID').format(Math.round(p));
  }

  // Format percentage
  function formatPercent(p: number): string {
    const sign = p >= 0 ? '+' : '';
    return `${sign}${p.toFixed(2)}%`;
  }

  // Calculate potential gain/loss
  $: potentialGain = ((targetPrice - price) / price) * 100;
  $: potentialLoss = ((price - cutLossPrice) / price) * 100;
</script>

<a
  href="/stock/{symbol}"
  class="card-hover block group"
>
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

  <div class="grid grid-cols-2 gap-3 pt-3 border-t border-slate-700">
    <div>
      <div class="text-xs text-slate-500 mb-1">Target Price</div>
      <div class="text-sm font-medium text-emerald-400">
        {formatPrice(targetPrice)}
        <span class="text-xs text-slate-500">(+{potentialGain.toFixed(1)}%)</span>
      </div>
    </div>
    <div>
      <div class="text-xs text-slate-500 mb-1">Cut Loss</div>
      <div class="text-sm font-medium text-red-400">
        {formatPrice(cutLossPrice)}
        <span class="text-xs text-slate-500">(-{potentialLoss.toFixed(1)}%)</span>
      </div>
    </div>
  </div>
</a>
