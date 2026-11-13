import type {
  LeaderboardEntry,
  LeaderboardStanding,
  SessionResult,
} from "./types";
import { SEED_LEADERBOARD, TEXT } from "./texts";

const BOARD_SIZE = 14;
const STORE_LIMIT = 20;

function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.date - b.date;
}

function validEntry(value: unknown): value is LeaderboardEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.name === "string" &&
    typeof entry.score === "number" &&
    typeof entry.caught === "number" &&
    typeof entry.best === "string" &&
    typeof entry.date === "number"
  );
}

export class Leaderboard {
  private readonly key: string;
  private entries: LeaderboardEntry[] = [];

  constructor(prefix: string) {
    this.key = `${prefix}:leaderboard:v1`;
    this.entries = this.read();
  }

  private read(): LeaderboardEntry[] {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(validEntry).slice(0, STORE_LIMIT);
    } catch {
      return [];
    }
  }

  private write(): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.entries));
    } catch {
      // Storage can be blocked; leaderboard still works for this session.
    }
  }

  private merged(): LeaderboardEntry[] {
    return [...this.entries, ...SEED_LEADERBOARD].sort(compareEntries);
  }

  /** Top entries including the seeded rivals. */
  top(count: number = BOARD_SIZE): LeaderboardEntry[] {
    return this.merged().slice(0, count);
  }

  /** Every entry, best first — the board may grow beyond a fixed size. */
  all(): LeaderboardEntry[] {
    return this.merged();
  }

  /** Best score saved by the local player (bots excluded). */
  personalBest(): LeaderboardEntry | null {
    if (this.entries.length === 0) return null;
    return this.entries.reduce((best, entry) =>
      entry.score > best.score ? entry : best,
    );
  }

  previewRank(score: number): number {
    return this.merged().filter((entry) => entry.score > score).length + 1;
  }

  qualifies(score: number): boolean {
    return this.previewRank(score) <= BOARD_SIZE;
  }

  submit(name: string, result: SessionResult): LeaderboardStanding {
    const entry: LeaderboardEntry = {
      id: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: (name.trim() || TEXT.common.playerFallback).slice(0, 12),
      score: Math.round(result.score),
      caught: result.caught,
      best: result.bestFish?.name ?? TEXT.common.dash,
      date: Date.now(),
    };
    this.entries.push(entry);
    this.entries.sort(compareEntries);
    this.entries = this.entries.slice(0, STORE_LIMIT);
    this.write();

    const merged = this.merged();
    const rank = merged.findIndex((item) => item.id === entry.id) + 1;
    return {
      rank: rank > 0 ? rank : merged.length,
      total: merged.length,
      inTop: rank > 0 && rank <= BOARD_SIZE,
      entry,
    };
  }

  reset(): void {
    this.entries = [];
    this.write();
  }
}

interface SettingsData {
  muted?: boolean;
  tutorialSeen?: boolean;
}

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
}

export interface WorldData {
  /** Minutes since midnight, 0..1439. */
  minutes: number;
  weather: string;
}

/** Time of day and current weather front, shared between sessions. */
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
      if (typeof record.minutes !== "number") return null;
      if (typeof record.weather !== "string") return null;
      return { minutes: record.minutes, weather: record.weather };
    } catch {
      return null;
    }
  }

  write(minutes: number, weather: string): void {
    try {
      localStorage.setItem(this.key, JSON.stringify({ minutes, weather }));
    } catch {
      // ignore
    }
  }
}
