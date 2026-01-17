<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { sessionStore } from '$lib/stores/session';

  onMount(() => {
    sessionStore.init();
  });
</script>

<div class="min-h-screen bg-slate-900">
  <header class="border-b border-slate-800 bg-slate-900/95 backdrop-blur sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-4 py-4">
      <div class="flex items-center justify-between">
        <a href="/" class="flex items-center gap-3 group">
          <span class="text-2xl">📊</span>
          <div>
            <h1 class="text-xl font-bold text-slate-100 group-hover:text-blue-400 transition-colors">
              Mine24 Stock
            </h1>
            <p class="text-xs text-slate-500">Indonesian Equity Analysis</p>
          </div>
        </a>
        <nav class="flex items-center gap-4">
          <a
            href="/"
            class="text-sm text-slate-400 hover:text-slate-100 transition-colors"
          >
            Dashboard
          </a>
        </nav>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 py-6">
    <slot />
  </main>

  <footer class="border-t border-slate-800 mt-12">
    <div class="max-w-7xl mx-auto px-4 py-6">
      <p class="text-center text-sm text-slate-500">
        Wyckoff analysis for Indonesian stocks. Data from Yahoo Finance.
      </p>
    </div>
  </footer>
</div>
