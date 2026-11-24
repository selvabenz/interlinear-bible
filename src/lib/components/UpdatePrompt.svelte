<script lang="ts">
  import { onMount } from 'svelte';
  import { LABELS } from '../i18n/labels';
  import { prefs } from '../stores/prefs.svelte';

  const L = $derived(LABELS[prefs.ui]);
  let need = $state(false);
  let ready = $state(false);
  let update: ((reload?: boolean) => Promise<void>) | null = null;

  onMount(async () => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    const { registerSW } = await import('virtual:pwa-register');
    update = registerSW({
      immediate: true,
      onNeedRefresh: () => (need = true),
      onOfflineReady: () => {
        ready = true;
        setTimeout(() => (ready = false), 4000);
      },
      onRegisteredSW: (_url, reg) => {
        // look for a new version every hour while the app stays open
        if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      }
    });
  });
</script>

{#if need}
  <div class="toast" role="status" data-print="hide">
    <span>{L.updateReady}</span>
    <button class="btn primary" onclick={() => update?.(true)}>{L.updateNow}</button>
    <button class="btn ghost light" onclick={() => (need = false)}>{L.later}</button>
  </div>
{:else if ready}
  <div class="toast" role="status" data-print="hide"><span>{L.offlineReady}</span></div>
{/if}

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px 10px 16px;
    background: rgba(31, 42, 51, 0.95);
    color: var(--card);
    border-radius: 10px;
    font-size: 13px;
    box-shadow: 0 16px 34px -20px rgba(31, 42, 51, 0.6);
    max-width: calc(100vw - 32px);
  }
  .light {
    color: #cfd6d3;
  }
</style>
