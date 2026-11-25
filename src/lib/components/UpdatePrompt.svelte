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
    bottom: max(18px, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px 10px 16px;
    background: var(--dark);
    color: var(--on-dark);
    border-radius: 10px;
    font-size: 13px;
    box-shadow: var(--shadow-pop);
    flex-wrap: wrap;
    max-width: calc(100vw - 32px);
  }
  .light {
    color: var(--on-dark-2);
  }
</style>
