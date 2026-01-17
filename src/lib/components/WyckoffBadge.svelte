<script lang="ts">
  import type { WyckoffPhase } from '$lib/server/db/schema';

  export let phase: WyckoffPhase;
  export let subPhase: string | null = null;
  export let size: 'sm' | 'md' | 'lg' = 'md';

  const phaseLabels: Record<WyckoffPhase, string> = {
    accumulation: 'Accumulation',
    markup: 'Markup',
    distribution: 'Distribution',
    markdown: 'Markdown'
  };

  const phaseColors: Record<WyckoffPhase, string> = {
    accumulation: 'badge-accumulation',
    markup: 'badge-markup',
    distribution: 'badge-distribution',
    markdown: 'badge-markdown'
  };

  const sizeClasses: Record<string, string> = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  };

  $: badgeClass = phaseColors[phase];
  $: sizeClass = sizeClasses[size];
</script>

<span class="{badgeClass} {sizeClass}">
  {phaseLabels[phase]}{subPhase ? ` (${subPhase})` : ''}
</span>
