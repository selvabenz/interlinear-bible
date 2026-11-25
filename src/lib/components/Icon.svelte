<script lang="ts" module>
  /** Line icons on a 24px grid (stroke only, currentColor). */
  const PATHS = {
    menu: 'M4 7h16M4 12h16M4 17h16',
    search: 'M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13zM20 20l-4.3-4.3',
    close: 'M6 6l12 12M18 6 6 18',
    back: 'M15 5l-7 7 7 7',
    chevron: 'M9 5l7 7-7 7',
    down: 'M6 9l6 6 6-6',
    book: 'M3 5.5c2.5-1.2 5.5-1.2 9 .5 3.5-1.7 6.5-1.7 9-.5v13c-2.5-1.2-5.5-1.2-9 .5-3.5-1.7-6.5-1.7-9-.5zM12 6v13.5',
    study: 'M12 4l8.5 4.2L12 12.4 3.5 8.2zM7 10.3v4.4c1.4 1.3 3 2 5 2s3.6-.7 5-2v-4.4M20.5 8.2v5.3',
    sliders: 'M4 7h9m4 0h3M15 5v4M4 17h3m4 0h9M9 15v4',
    type: 'M5 6.5V5h14v1.5M12 5v14M9 19h6',
    layers: 'M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
    list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    panel: 'M4 5h16v14H4zM9.5 5v14',
    print: 'M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z',
    upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
    download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.6v.01',
    check: 'M5 12.5l4.5 4.5L19 7',
    sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
    flag: 'M5 21V4M5 4h11l-2 4 2 4H5'
  } as const;
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 20 }: { name: IconName; size?: number } = $props();
</script>

<svg class="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d={PATHS[name]} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
</svg>

<style>
  .icon {
    flex: 0 0 auto;
    display: block;
  }
</style>
