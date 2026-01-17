<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

  export let data: {
    date: string;
    foreignBuy: number;
    foreignSell: number;
    foreignNet: number;
  }[] = [];

  let chartContainer: HTMLDivElement;
  let chart: ReturnType<typeof import('lightweight-charts').createChart> | null = null;

  // Calculate totals
  $: totalBuy = data.reduce((sum, d) => sum + d.foreignBuy, 0);
  $: totalSell = data.reduce((sum, d) => sum + d.foreignSell, 0);
  $: totalNet = data.reduce((sum, d) => sum + d.foreignNet, 0);

  function formatValue(value: number): string {
    const absValue = Math.abs(value);
    if (absValue >= 1e12) {
      return (value / 1e12).toFixed(2) + 'T';
    } else if (absValue >= 1e9) {
      return (value / 1e9).toFixed(2) + 'B';
    } else if (absValue >= 1e6) {
      return (value / 1e6).toFixed(2) + 'M';
    } else if (absValue >= 1e3) {
      return (value / 1e3).toFixed(2) + 'K';
    }
    return value.toString();
  }

  onMount(async () => {
    if (!browser || data.length === 0) return;

    const { createChart, ColorType } = await import('lightweight-charts');

    chart = createChart(chartContainer, {
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8'
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' }
      },
      rightPriceScale: {
        borderColor: '#475569'
      },
      timeScale: {
        borderColor: '#475569',
        timeVisible: true,
        secondsVisible: false
      },
      width: chartContainer.clientWidth,
      height: 250
    });

    // Net foreign flow as histogram
    const netSeries = chart.addHistogramSeries({
      color: '#3B82F6',
      priceFormat: {
        type: 'volume'
      }
    });

    const netData = data.map((d) => ({
      time: d.date,
      value: d.foreignNet,
      color: d.foreignNet >= 0 ? '#10B981' : '#EF4444'
    }));

    netSeries.setData(netData as Parameters<typeof netSeries.setData>[0]);

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chart && chartContainer) {
        chart.applyOptions({ width: chartContainer.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });

  onDestroy(() => {
    if (chart) {
      chart.remove();
      chart = null;
    }
  });
</script>

<div class="card">
  <h3 class="section-title">Foreign Flow</h3>

  {#if data.length === 0}
    <div class="h-[250px] flex items-center justify-center text-slate-500">
      No foreign flow data available
    </div>
  {:else}
    <div class="grid grid-cols-3 gap-4 mb-4">
      <div class="text-center p-3 bg-slate-700/50 rounded-lg">
        <div class="text-xs text-slate-500 mb-1">Foreign Buy</div>
        <div class="text-lg font-semibold text-emerald-400">{formatValue(totalBuy)}</div>
      </div>
      <div class="text-center p-3 bg-slate-700/50 rounded-lg">
        <div class="text-xs text-slate-500 mb-1">Foreign Sell</div>
        <div class="text-lg font-semibold text-red-400">{formatValue(totalSell)}</div>
      </div>
      <div class="text-center p-3 bg-slate-700/50 rounded-lg">
        <div class="text-xs text-slate-500 mb-1">Net Flow</div>
        <div class="text-lg font-semibold {totalNet >= 0 ? 'text-emerald-400' : 'text-red-400'}">
          {totalNet >= 0 ? '+' : ''}{formatValue(totalNet)}
        </div>
      </div>
    </div>

    <div bind:this={chartContainer} class="w-full" />

    <div class="mt-3 text-xs text-slate-500 text-center">
      Daily net foreign flow (Buy - Sell in shares)
    </div>
  {/if}
</div>
