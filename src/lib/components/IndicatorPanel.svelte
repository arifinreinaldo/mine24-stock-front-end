<script lang="ts">
  export let rsi: number | null = null;
  export let mfi: number | null = null;
  export let macdLine: number | null = null;
  export let macdSignal: number | null = null;
  export let macdHistogram: number | null = null;
  export let ma20: number | null = null;
  export let ma50: number | null = null;
  export let ma200: number | null = null;
  export let volumeRatio: number | null = null;

  function getRsiStatus(value: number | null): { label: string; color: string } {
    if (value === null) return { label: 'N/A', color: 'text-slate-500' };
    if (value >= 70) return { label: 'Overbought', color: 'text-red-400' };
    if (value <= 30) return { label: 'Oversold', color: 'text-emerald-400' };
    return { label: 'Neutral', color: 'text-slate-300' };
  }

  function getMfiStatus(value: number | null): { label: string; color: string } {
    if (value === null) return { label: 'N/A', color: 'text-slate-500' };
    if (value >= 80) return { label: 'Money Outflow', color: 'text-red-400' };
    if (value <= 20) return { label: 'Money Inflow', color: 'text-emerald-400' };
    return { label: 'Neutral', color: 'text-slate-300' };
  }

  function getMacdStatus(): { label: string; color: string } {
    if (macdLine === null || macdSignal === null) return { label: 'N/A', color: 'text-slate-500' };
    if (macdLine > macdSignal) return { label: 'Bullish', color: 'text-emerald-400' };
    return { label: 'Bearish', color: 'text-red-400' };
  }

  function getVolumeStatus(ratio: number | null): { label: string; color: string } {
    if (ratio === null) return { label: 'N/A', color: 'text-slate-500' };
    if (ratio >= 2) return { label: 'Very High', color: 'text-blue-400' };
    if (ratio >= 1.5) return { label: 'High', color: 'text-emerald-400' };
    if (ratio <= 0.5) return { label: 'Low', color: 'text-amber-400' };
    return { label: 'Normal', color: 'text-slate-300' };
  }

  function formatNumber(value: number | null, decimals: number = 2): string {
    if (value === null) return 'N/A';
    return value.toLocaleString('id-ID', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function formatPrice(value: number | null): string {
    if (value === null) return 'N/A';
    return Math.round(value).toLocaleString('id-ID');
  }

  $: rsiStatus = getRsiStatus(rsi);
  $: mfiStatus = getMfiStatus(mfi);
  $: macdStatus = getMacdStatus();
  $: volumeStatus = getVolumeStatus(volumeRatio);
</script>

<div class="card">
  <h3 class="section-title">Technical Indicators</h3>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <!-- RSI -->
    <div class="p-3 bg-slate-700/50 rounded-lg">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-slate-400">RSI (14)</span>
        <span class="text-xs {rsiStatus.color}">{rsiStatus.label}</span>
      </div>
      <div class="text-2xl font-semibold {rsiStatus.color}">
        {formatNumber(rsi, 1)}
      </div>
      {#if rsi !== null}
        <div class="mt-2 h-1.5 bg-slate-600 rounded-full overflow-hidden">
          <div
            class="h-full transition-all duration-300 {rsi >= 70 ? 'bg-red-500' : rsi <= 30 ? 'bg-emerald-500' : 'bg-blue-500'}"
            style="width: {rsi}%"
          ></div>
        </div>
        <div class="flex justify-between text-xs text-slate-500 mt-1">
          <span>30</span>
          <span>50</span>
          <span>70</span>
        </div>
      {/if}
    </div>

    <!-- MFI -->
    <div class="p-3 bg-slate-700/50 rounded-lg">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-slate-400">MFI (14)</span>
        <span class="text-xs {mfiStatus.color}">{mfiStatus.label}</span>
      </div>
      <div class="text-2xl font-semibold {mfiStatus.color}">
        {formatNumber(mfi, 1)}
      </div>
      {#if mfi !== null}
        <div class="mt-2 h-1.5 bg-slate-600 rounded-full overflow-hidden">
          <div
            class="h-full transition-all duration-300 {mfi >= 80 ? 'bg-red-500' : mfi <= 20 ? 'bg-emerald-500' : 'bg-blue-500'}"
            style="width: {mfi}%"
          ></div>
        </div>
        <div class="flex justify-between text-xs text-slate-500 mt-1">
          <span>20</span>
          <span>50</span>
          <span>80</span>
        </div>
      {/if}
    </div>

    <!-- MACD -->
    <div class="p-3 bg-slate-700/50 rounded-lg">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-slate-400">MACD</span>
        <span class="text-xs {macdStatus.color}">{macdStatus.label}</span>
      </div>
      <div class="space-y-1 text-sm">
        <div class="flex justify-between">
          <span class="text-slate-400">Line:</span>
          <span class="text-slate-200">{formatNumber(macdLine)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Signal:</span>
          <span class="text-slate-200">{formatNumber(macdSignal)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">Histogram:</span>
          <span class="{macdHistogram && macdHistogram > 0 ? 'text-emerald-400' : 'text-red-400'}">
            {formatNumber(macdHistogram)}
          </span>
        </div>
      </div>
    </div>

    <!-- Moving Averages -->
    <div class="p-3 bg-slate-700/50 rounded-lg">
      <div class="text-sm text-slate-400 mb-2">Moving Averages</div>
      <div class="space-y-1 text-sm">
        <div class="flex justify-between">
          <span class="text-slate-400">MA20:</span>
          <span class="text-blue-400">{formatPrice(ma20)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">MA50:</span>
          <span class="text-amber-400">{formatPrice(ma50)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">MA200:</span>
          <span class="text-purple-400">{formatPrice(ma200)}</span>
        </div>
      </div>
    </div>

    <!-- Volume -->
    <div class="p-3 bg-slate-700/50 rounded-lg">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-slate-400">Volume Ratio</span>
        <span class="text-xs {volumeStatus.color}">{volumeStatus.label}</span>
      </div>
      <div class="text-2xl font-semibold {volumeStatus.color}">
        {volumeRatio !== null ? `${formatNumber(volumeRatio, 2)}x` : 'N/A'}
      </div>
      <div class="text-xs text-slate-500 mt-1">
        vs 20-day average
      </div>
    </div>
  </div>
</div>
