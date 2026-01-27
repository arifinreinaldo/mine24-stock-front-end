<script lang="ts">
  import type { StockRecommendation } from '$lib/server/analysis/recommendation';

  export let recommendation: StockRecommendation;
  export let symbol: string;
  export let currentPrice: number;

  function getActionColor(action: string): string {
    switch (action) {
      case 'STRONG_BUY':
        return 'bg-green-600';
      case 'BUY':
        return 'bg-green-500';
      case 'HOLD':
        return 'bg-yellow-500';
      case 'SELL':
        return 'bg-red-500';
      case 'STRONG_SELL':
        return 'bg-red-600';
      default:
        return 'bg-gray-500';
    }
  }

  function getActionTextColor(action: string): string {
    switch (action) {
      case 'STRONG_BUY':
        return 'text-green-400';
      case 'BUY':
        return 'text-green-400';
      case 'HOLD':
        return 'text-yellow-400';
      case 'SELL':
        return 'text-red-400';
      case 'STRONG_SELL':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  }

  function getActionLabel(action: string): string {
    switch (action) {
      case 'STRONG_BUY':
        return 'Strong Buy';
      case 'BUY':
        return 'Buy';
      case 'HOLD':
        return 'Hold';
      case 'SELL':
        return 'Sell';
      case 'STRONG_SELL':
        return 'Strong Sell';
      default:
        return action;
    }
  }

  function getSignalIcon(signal: string): string {
    switch (signal) {
      case 'bullish':
        return '+';
      case 'bearish':
        return '-';
      default:
        return '~';
    }
  }

  function getSignalColor(signal: string): string {
    switch (signal) {
      case 'bullish':
        return 'text-green-400';
      case 'bearish':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  }

  function formatPrice(price: number): string {
    return price.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  $: isBuyRecommendation = recommendation.action === 'STRONG_BUY' || recommendation.action === 'BUY';
  $: potentialGain = ((recommendation.targetPrice - currentPrice) / currentPrice) * 100;
  $: potentialLoss = ((currentPrice - recommendation.stopLoss) / currentPrice) * 100;
</script>

<div class="bg-gray-800 rounded-xl p-5 shadow-lg">
  <!-- Header with Action Badge -->
  <div class="flex items-center justify-between mb-4">
    <div class="flex items-center gap-3">
      <span class="px-3 py-1.5 text-sm font-bold rounded-lg {getActionColor(recommendation.action)} text-white">
        {getActionLabel(recommendation.action)}
      </span>
      <span class="text-gray-400 text-sm">
        Confidence: <span class="font-semibold text-white">{recommendation.confidence}%</span>
      </span>
    </div>
    <span class="text-xs text-gray-500">{symbol}</span>
  </div>

  <!-- Summary -->
  <p class="text-gray-300 text-sm mb-4 leading-relaxed">
    {recommendation.summary}
  </p>

  <!-- Price Targets -->
  {#if isBuyRecommendation}
    <div class="grid grid-cols-3 gap-3 mb-4">
      <!-- Entry Price -->
      <div class="bg-gray-700/50 rounded-lg p-3">
        <p class="text-xs text-gray-400 mb-1">Entry Range</p>
        <p class="text-sm font-semibold text-blue-400">
          {formatPrice(recommendation.entryPriceMin)} - {formatPrice(recommendation.entryPriceMax)}
        </p>
      </div>

      <!-- Target Price -->
      <div class="bg-gray-700/50 rounded-lg p-3">
        <p class="text-xs text-gray-400 mb-1">Target Price</p>
        <p class="text-sm font-semibold text-green-400">
          {formatPrice(recommendation.targetPrice)}
        </p>
        <p class="text-xs text-green-500">+{potentialGain.toFixed(1)}%</p>
      </div>

      <!-- Stop Loss -->
      <div class="bg-gray-700/50 rounded-lg p-3">
        <p class="text-xs text-gray-400 mb-1">Stop Loss</p>
        <p class="text-sm font-semibold text-red-400">
          {formatPrice(recommendation.stopLoss)}
        </p>
        <p class="text-xs text-red-500">-{potentialLoss.toFixed(1)}%</p>
      </div>
    </div>

    <!-- Risk/Reward -->
    <div class="flex items-center justify-between bg-gray-700/30 rounded-lg px-3 py-2 mb-4">
      <span class="text-sm text-gray-400">Risk/Reward Ratio</span>
      <span class="text-sm font-bold {recommendation.riskRewardRatio >= 2 ? 'text-green-400' : recommendation.riskRewardRatio >= 1 ? 'text-yellow-400' : 'text-red-400'}">
        {recommendation.riskRewardRatio.toFixed(2)} : 1
      </span>
    </div>
  {:else}
    <!-- For Hold/Sell recommendations -->
    <div class="bg-gray-700/30 rounded-lg p-3 mb-4">
      <p class="text-sm text-gray-400">
        {#if recommendation.action === 'HOLD'}
          Current position can be maintained. No new entries recommended at this level.
        {:else}
          Consider reducing or exiting position. Stop loss at <span class="font-semibold text-red-400">{formatPrice(recommendation.stopLoss)}</span>
        {/if}
      </p>
    </div>
  {/if}

  <!-- Signal Factors -->
  <div class="border-t border-gray-700 pt-3">
    <p class="text-xs text-gray-500 mb-2 font-medium">Analysis Factors</p>
    <div class="space-y-1.5">
      {#each recommendation.factors as factor}
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 flex items-center justify-center rounded-full {getSignalColor(factor.signal)} bg-gray-700 font-bold text-xs">
              {getSignalIcon(factor.signal)}
            </span>
            <span class="text-gray-400">{factor.name}</span>
          </div>
          <span class="text-gray-500 text-right max-w-[200px] truncate" title={factor.description}>
            {factor.description}
          </span>
        </div>
      {/each}
    </div>
  </div>
</div>
