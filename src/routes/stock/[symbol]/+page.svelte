<script lang="ts">
  import type { PageData } from './$types';
  import StockChart from '$lib/components/StockChart.svelte';
  import ForeignFlowChart from '$lib/components/ForeignFlowChart.svelte';
  import IndicatorPanel from '$lib/components/IndicatorPanel.svelte';
  import WyckoffBadge from '$lib/components/WyckoffBadge.svelte';

  export let data: PageData;

  $: stock = data.stock;
  $: prices = data.prices;
  $: metrics = data.metrics;
  $: foreignFlow = data.foreignFlow;

  // Determine if this is a bullish (long) or bearish (short) phase
  $: isLongPosition = stock.phase === 'accumulation' || stock.phase === 'markup';

  function formatPrice(p: number): string {
    return new Intl.NumberFormat('id-ID').format(Math.round(p));
  }

  function formatPercent(p: number): string {
    const sign = p >= 0 ? '+' : '';
    return `${sign}${p.toFixed(2)}%`;
  }

  $: changeClass = stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400';

  // Calculate potential gain/loss based on position type
  $: potentialGain = isLongPosition
    ? ((stock.targetPrice - stock.price) / stock.price) * 100
    : ((stock.price - stock.targetPrice) / stock.price) * 100;

  $: potentialLoss = isLongPosition
    ? ((stock.price - stock.cutLossPrice) / stock.price) * 100
    : ((stock.cutLossPrice - stock.price) / stock.price) * 100;
</script>

<svelte:head>
  <title>{stock.symbol} - Mine24 Stock Dashboard</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
    <div>
      <div class="flex items-center gap-3 mb-2">
        <a
          href="/"
          class="text-slate-400 hover:text-slate-200 transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </a>
        <h1 class="text-3xl font-bold text-slate-100">
          {stock.symbol.replace('.JK', '')}
        </h1>
        <WyckoffBadge phase={stock.phase} subPhase={stock.subPhase} size="lg" />
      </div>
      <p class="text-slate-400 text-lg">{stock.name}</p>
    </div>

    <div class="text-right">
      <div class="text-4xl font-bold text-slate-100">
        Rp {formatPrice(stock.price)}
      </div>
      <div class="{changeClass} text-xl font-medium">
        {formatPercent(stock.changePercent)}
        <span class="text-slate-500 text-base">
          ({stock.change >= 0 ? '+' : ''}{formatPrice(stock.change)})
        </span>
      </div>
    </div>
  </div>

  <!-- Position Type Indicator -->
  <div class="card">
    <div class="flex items-center gap-3">
      {#if isLongPosition}
        <span class="text-sm font-medium px-3 py-1 rounded bg-emerald-500/20 text-emerald-400">LONG POSITION</span>
        <span class="text-sm text-slate-400" title="Buy and hold - profit when price rises">
          Buy recommendation - targets are upside price levels
        </span>
      {:else}
        <span class="text-sm font-medium px-3 py-1 rounded bg-red-500/20 text-red-400">SHORT POSITION</span>
        <span class="text-sm text-slate-400" title="Sell/avoid - profit when price falls">
          Sell recommendation - targets are downside price levels
        </span>
      {/if}
    </div>
  </div>

  <!-- Key Metrics -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div class="card">
      <div
        class="text-sm text-slate-500 mb-1 cursor-help"
        title={isLongPosition
          ? "Target price to take profit on long position"
          : "Expected price drop target for short position"}
      >
        {isLongPosition ? 'Target Price' : 'Downside Target'}
      </div>
      <div class="text-xl font-semibold {isLongPosition ? 'text-emerald-400' : 'text-amber-400'}">
        Rp {formatPrice(stock.targetPrice)}
      </div>
      <div class="text-xs text-slate-500">
        +{potentialGain.toFixed(1)}% potential
      </div>
    </div>

    <div class="card">
      <div
        class="text-sm text-slate-500 mb-1 cursor-help"
        title={isLongPosition
          ? "Exit price if trade goes against you"
          : "Exit price if price rises against short position"}
      >
        {isLongPosition ? 'Cut Loss' : 'Stop Loss'}
      </div>
      <div class="text-xl font-semibold text-red-400">
        Rp {formatPrice(stock.cutLossPrice)}
      </div>
      <div class="text-xs text-slate-500">
        -{potentialLoss.toFixed(1)}% risk
      </div>
    </div>

    <div class="card">
      <div class="text-sm text-slate-500 mb-1">Wyckoff Strength</div>
      <div class="text-xl font-semibold text-blue-400">
        {stock.strength.toFixed(0)}%
      </div>
      <div class="text-xs text-slate-500">
        Signal confidence
      </div>
    </div>

    <div class="card">
      <div class="text-sm text-slate-500 mb-1">Support / Resistance</div>
      <div class="text-xl font-semibold text-slate-200">
        {formatPrice(stock.support)} / {formatPrice(stock.resistance)}
      </div>
      <div class="text-xs text-slate-500">
        Key levels
      </div>
    </div>
  </div>

  <!-- Analysis Notes -->
  {#if stock.analysisNotes}
    <div class="card">
      <h3 class="section-title">Analysis</h3>
      <p class="text-slate-300">{stock.analysisNotes}</p>
    </div>
  {/if}

  <!-- Chart -->
  <StockChart
    {prices}
    support={stock.support}
    resistance={stock.resistance}
    targetPrice={stock.targetPrice}
    cutLossPrice={stock.cutLossPrice}
    phase={stock.phase}
    ma20={metrics.ma20}
    ma50={metrics.ma50}
  />

  <!-- Indicators -->
  <IndicatorPanel
    rsi={metrics.rsi14}
    mfi={metrics.mfi14}
    macdLine={metrics.macdLine}
    macdSignal={metrics.macdSignal}
    macdHistogram={metrics.macdHistogram}
    ma20={metrics.ma20}
    ma50={metrics.ma50}
    ma200={metrics.ma200}
    volumeRatio={metrics.volumeRatio}
  />

  <!-- Foreign Flow -->
  <ForeignFlowChart data={foreignFlow} />
</div>
