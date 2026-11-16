import type { AreaId, WeatherId } from "./types";
import { AUDIO_MIX, MIX_CHANNELS, type AudioMix } from "./audioMix";
import { TEXT } from "./texts";
import { AudioMixPanel } from "./ui/AudioMixPanel";
import { DevWeatherPanel } from "./ui/DevWeatherPanel";
import { copyOrDownloadMix, saveOrDownloadMix } from "./audioMixSave";
import { GameScreen } from "./screens/GameScreen";
import { GameInputLayer } from "./GameInputLayer";

export abstract class GameDevLayer extends GameInputLayer {
  toggleAudioPanel(): void {
    if (!import.meta.env.DEV) return;
    if (this.audioPanel?.isOpen) this.closeAudioPanel();
    else this.openAudioPanel();
  }

  openAudioPanel(): void {
    if (!import.meta.env.DEV || this.assetBag === null) return;
    const panel = this.audioPanel ?? this.mountAudioPanel();
    if (!panel.isOpen) {
      panel.open();
      // Lift any pause duck: the mixer has to hear the channels it edits.
      this.screens.active?.onAudioPanel(true);
    }
  }

  closeAudioPanel(): void {
    if (!this.audioPanel?.isOpen) return;
    this.audioPanel.close();
    this.screens.active?.onAudioPanel(false);
  }

  /** Opens or closes the dev weather picker (`F3`, dev only). */
  toggleDevPanel(): void {
    if (!import.meta.env.DEV) return;
    if (this.devPanel?.isOpen) this.closeDevPanel();
    else this.openDevPanel();
  }

  openDevPanel(): void {
    if (!import.meta.env.DEV || this.assetBag === null) return;
    const panel = this.devPanel ?? this.mountDevPanel();
    if (!panel.isOpen) panel.open();
  }

  closeDevPanel(): void {
    this.devPanel?.close();
  }

  /**
   * Pins the weather of the current water body (`F3` panel). Saved like a
   * normal front, so the pick survives a reload.
   */
  setWeather(weather: WeatherId, areaId: AreaId = this.areaId): void {
    this.clock.setWeather(weather, areaId);
    this.clock.persist();
    const active = this.screens.active;
    if (active instanceof GameScreen && areaId === this.areaId) {
      active.snapWeather();
    }
    this.devPanel?.refresh();
  }

  protected mountDevPanel(): DevWeatherPanel {
    const panel = new DevWeatherPanel({
      current: () => this.clock.weatherFor(this.areaId),
      onPick: (weather) => this.setWeather(weather),
      onClose: () => this.closeDevPanel(),
    });
    this.devPanel = panel;
    // Above the screen layer, so the picker is never clipped by the letterbox
    // and its buttons take the click before the water does.
    this.world.addChild(panel);
    return panel;
  }

  protected mountAudioPanel(): AudioMixPanel {
    const panel = new AudioMixPanel({
      audio: this.audio,
      onPersist: (mix) => this.persistMix(mix),
      onSave: async (mix) => {
        const message = await saveOrDownloadMix(mix);
        // Once the block is in the source it *is* the code default, so the
        // device-local overrides have to go or they would shadow it forever.
        if (message === TEXT.devtools.savedToCode) this.settings.mix = null;
        return message;
      },
      onCopy: (mix) => copyOrDownloadMix(mix),
      isMuted: () => this.muted,
      onToggleMute: () => this.toggleMute(),
      onClose: () => this.closeAudioPanel(),
    });
    this.audioPanel = panel;
    // Above the screen layer, so the panel is not clipped by the letterbox and
    // receives pointer events before the game does.
    this.world.addChild(panel);
    return panel;
  }

  /**
   * Stores only the channels that differ from the code defaults, so a later
   * edit to `audioMix.ts` still wins for everything the panel did not touch.
   */
  protected persistMix(mix: AudioMix): void {
    const overrides: Partial<AudioMix> = {};
    for (const channel of MIX_CHANNELS) {
      const value = mix[channel.id];
      if (Math.abs(value - AUDIO_MIX[channel.id]) > 0.004) {
        overrides[channel.id] = value;
      }
    }
    this.settings.mix = Object.keys(overrides).length > 0 ? overrides : null;
  }
}
