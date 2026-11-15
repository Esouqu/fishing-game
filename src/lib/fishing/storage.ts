import { normalizeMix, type AudioMix } from "./audioMix";

interface SettingsData {
  muted?: boolean;
  tutorialSeen?: boolean;
  /**
   * Audio balance tuned in the dev panel. It only overrides the channels it
   * names, so saving the mix into `audioMix.ts` still wins for the rest.
   */
  mix?: Partial<AudioMix>;
}

/** Device-local settings that should not travel with the player profile. */
export class SettingsStore {
  private readonly key: string;
  private data: SettingsData;

  constructor(prefix: string) {
    this.key = `${prefix}:settings:v1`;
    this.data = this.read();
  }

  private read(): SettingsData {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return {};
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      const record = parsed as Record<string, unknown>;
      const data: SettingsData = {};
      if (typeof record.muted === "boolean") data.muted = record.muted;
      if (typeof record.tutorialSeen === "boolean") {
        data.tutorialSeen = record.tutorialSeen;
      }
      const mix = normalizeMix(
        record.mix && typeof record.mix === "object"
          ? (record.mix as Record<string, number>)
          : null,
      );
      if (Object.keys(mix).length > 0) data.mix = mix;
      return data;
    } catch {
      return {};
    }
  }

  private write(): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch {
      // ignore
    }
  }

  get muted(): boolean | undefined {
    return this.data.muted;
  }

  set muted(value: boolean) {
    this.data.muted = value;
    this.write();
  }

  get tutorialSeen(): boolean {
    return this.data.tutorialSeen === true;
  }

  set tutorialSeen(value: boolean) {
    this.data.tutorialSeen = value;
    this.write();
  }

  /** Dev-panel balance overrides, or `undefined` when the code values are used. */
  get mix(): Partial<AudioMix> | undefined {
    return this.data.mix;
  }

  set mix(value: Partial<AudioMix> | null) {
    if (value) this.data.mix = normalizeMix(value);
    else delete this.data.mix;
    this.write();
  }
}

export interface WorldData {
  /**
   * Weather fronts, one per area. Older saves hold a single front as a plain
   * string; the clock expands it to every area on load. The time of day is not
   * stored any more: the clock follows the player's wall clock.
   */
  weather: Record<string, string> | string;
}

/** Weather fronts of every water body. */
export class WorldStore {
  private readonly key: string;

  constructor(prefix: string) {
    this.key = `${prefix}:world:v1`;
  }

  read(): WorldData | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const record = parsed as Record<string, unknown>;
      const weather = record.weather;
      if (typeof weather === "string") return { weather };
      if (!weather || typeof weather !== "object" || Array.isArray(weather)) {
        return null;
      }
      const fronts: Record<string, string> = {};
      for (const [areaId, value] of Object.entries(weather)) {
        if (typeof value === "string") fronts[areaId] = value;
      }
      return { weather: fronts };
    } catch {
      return null;
    }
  }

  write(weather: Record<string, string>): void {
    try {
      localStorage.setItem(this.key, JSON.stringify({ weather }));
    } catch {
      // ignore
    }
  }
}
