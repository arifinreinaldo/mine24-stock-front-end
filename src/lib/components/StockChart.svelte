<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import type { WyckoffPhase } from '$lib/server/db/schema';

  export let prices: {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[] = [];

  export let support: number | null = null;
  export let resistance: number | null = null;
  export let targetPrice: number | null = null;
  export let cutLossPrice: number | null = null;
  export let phase: WyckoffPhase | null = null;
  export let ma20: number | null = null;
  export let ma50: number | null = null;

  let chartContainer: HTMLDivElement;
  let chart: ReturnType<typeof import('lightweight-charts').createChart> | null = null;
  let candleSeries: ReturnType<NonNullable<typeof chart>['addCandlestickSeries']> | null = null;
  let volumeSeries: ReturnType<NonNullable<typeof chart>['addHistogramSeries']> | null = null;

  const phaseColors: Record<WyckoffPhase, string> = {
    accumulation: '#10B981',
    markup: '#3B82F6',
    distribution: '#F59E0B',
    markdown: '#EF4444'
  };

  onMount(async () => {
    if (!browser || prices.length === 0) return;

    const { createChart, ColorType, CrosshairMode } = await import('lightweight-charts');

    chart = createChart(chartContainer, {
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#94a3b8'
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' }
      },
      crosshair: {
        mode: CrosshairMode.Normal
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
      height: 400
    });

    // Candlestick series
    candleSeries = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#EF4444',
      borderUpColor: '#10B981',
      borderDownColor: '#EF4444',
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444'
    });

    const candleData = prices.map((p) => ({
      time: p.date,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close
    }));

    candleSeries.setData(candleData as Parameters<typeof candleSeries.setData>[0]);

    // Add price lines for support/resistance/target/cutloss
    if (support) {
      candleSeries.createPriceLine({
        price: support,
        color: '#10B981',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: 'Support'
      });
    }

    if (resistance) {
      candleSeries.createPriceLine({
        price: resistance,
        color: '#EF4444',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Resistance'
      });
    }

    if (targetPrice) {
      candleSeries.createPriceLine({
        price: targetPrice,
        color: '#22C55E',
        lineWidth: 2,
        lineStyle: 0, // Solid
        axisLabelVisible: true,
        title: 'Target'
      });
    }

    if (cutLossPrice) {
      candleSeries.createPriceLine({
        price: cutLossPrice,
        color: '#DC2626',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: 'Cut Loss'
      });
    }

    // Volume series
    volumeSeries = chart.addHistogramSeries({
      color: '#3B82F6',
      priceFormat: {
        type: 'volume'
      },
      priceScaleId: '',
      scaleMargins: {
        top: 0.8,
        bottom: 0
      }
    });

    const volumeData = prices.map((p) => ({
      time: p.date,
      value: p.volume,
      color: p.close >= p.open ? '#10B98180' : '#EF444480'
    }));

    volumeSeries.setData(volumeData as Parameters<typeof volumeSeries.setData>[0]);

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
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

  $: if (chart && candleSeries && prices.length > 0) {
    const candleData = prices.map((p) => ({
      time: p.date,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close
    }));
    candleSeries.setData(candleData as Parameters<typeof candleSeries.setData>[0]);

    if (volumeSeries) {
      const volumeData = prices.map((p) => ({
        time: p.date,
        value: p.volume,
        color: p.close >= p.open ? '#10B98180' : '#EF444480'
      }));
      volumeSeries.setData(volumeData as Parameters<typeof volumeSeries.setData>[0]);
    }

    chart.timeScale().fitContent();
  }
</script>

<div class="card">
  <div class="flex items-center justify-between mb-4">
    <h3 class="section-title mb-0">Price Chart</h3>
    {#if phase}
      <span
        class="text-xs px-2 py-1 rounded"
        style="background-color: {phaseColors[phase]}20; color: {phaseColors[phase]};"
      >
        {phase.charAt(0).toUpperCase() + phase.slice(1)} Phase
      </span>
    {/if}
  </div>

  {#if prices.length === 0}
    <div class="h-[400px] flex items-center justify-center text-slate-500">
      No price data available
    </div>
  {:else}
    <div bind:this={chartContainer} class="w-full" />
  {/if}

  <div class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
    {#if support}
      <div class="flex items-center gap-2">
        <span class="w-3 h-0.5 bg-emerald-500"></span>
        <span class="text-slate-400">Support:</span>
        <span class="text-slate-200">{support.toLocaleString('id-ID')}</span>
      </div>
    {/if}
    {#if resistance}
      <div class="flex items-center gap-2">
        <span class="w-3 h-0.5 bg-red-500"></span>
        <span class="text-slate-400">Resistance:</span>
        <span class="text-slate-200">{resistance.toLocaleString('id-ID')}</span>
      </div>
    {/if}
    {#if targetPrice}
      <div class="flex items-center gap-2">
        <span class="w-3 h-0.5 bg-green-500"></span>
        <span class="text-slate-400">Target:</span>
        <span class="text-green-400">{targetPrice.toLocaleString('id-ID')}</span>
      </div>
    {/if}
    {#if cutLossPrice}
      <div class="flex items-center gap-2">
        <span class="w-3 h-0.5 bg-red-600"></span>
        <span class="text-slate-400">Cut Loss:</span>
        <span class="text-red-400">{cutLossPrice.toLocaleString('id-ID')}</span>
      </div>
    {/if}
  </div>
</div>
