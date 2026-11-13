<script lang="ts">
  import { onMount } from "svelte";
  import { TEXT } from "./fishing/texts";
  import type {
    FishingGameInstance,
    SessionResult,
    StartScreen,
  } from "./fishing";

  interface Props {
    /** Base URL of the copied art/font folder. */
    assetBase?: string;
    /** localStorage namespace, useful when embedding several games. */
    storagePrefix?: string;
    muted?: boolean;
    startScreen?: StartScreen;
    playerName?: string;
    onExit?: () => void;
    onScore?: (result: SessionResult) => void;
    onReady?: () => void;
    class?: string;
  }

  let {
    assetBase = `${import.meta.env.BASE_URL}assets/fishing`,
    storagePrefix = "quiet-cove",
    muted = false,
    startScreen = "menu",
    playerName = "",
    onExit,
    onScore,
    onReady,
    class: className = "",
  }: Props = $props();

  let host = $state<HTMLDivElement | null>(null);
  let game: FishingGameInstance | null = null;

  onMount(() => {
    let disposed = false;

    void (async () => {
      if (!host) return;
      try {
        // Dynamic import keeps `window`/`document` out of module scope, so the
        // component is safe to render during SSR.
        const { createFishingGame } = await import("./fishing");
        if (disposed || !host) return;

        const instance = await createFishingGame({
          container: host,
          assetBase,
          storagePrefix,
          muted,
          startScreen,
          playerName,
          onExit,
          onScore,
          onReady,
        });

        if (disposed) {
          instance.destroy();
          return;
        }
        game = instance;
      } catch (error) {
        console.error("[quiet-cove] failed to initialise", error);
      }
    })();

    return () => {
      disposed = true;
      game?.destroy();
      game = null;
    };
  });

  export function restart(): void {
    game?.restart();
  }

  export function pause(): void {
    game?.pause();
  }

  export function resume(): void {
    game?.resume();
  }

  export function showMenu(): void {
    game?.showMenu();
  }

  export function setMuted(value: boolean): void {
    game?.setMuted(value);
  }
</script>

<div
  bind:this={host}
  class="fishing-game {className}"
  role="application"
  aria-label={TEXT.common.ariaLabel}
></div>

<style>
  .fishing-game {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    min-height: 220px;
    overflow: hidden;
    background: #14182e;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }
</style>
