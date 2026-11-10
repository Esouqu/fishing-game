import type {
  LeaderboardEntry,
  LeaderboardStanding,
  SessionResult,
} from "./types";

const BOTS: readonly LeaderboardEntry[] = [
  {
    id: "bot-marina",
    name: "Марина",
    score: 3180,
    caught: 10,
    best: "Легендарная",
    date: 0,
    bot: true,
  },
  {
    id: "bot-cat",
    name: "Кот-Рыбак",
    score: 2760,
    caught: 10,
    best: "Золотая",
    date: 0,
    bot: true,
  },
  {
    id: "bot-cove",
    name: "Тихий Плёс",
    score: 2430,
    caught: 10,
    best: "Лосось",
    date: 0,
    bot: true,
  },
  {
    id: "bot-fedor",
    name: "Дядя Фёдор",
    score: 2110,
    caught: 9,
    best: "Сом",
    date: 0,
    bot: true,
  },
  {
    id: "bot-sonya",
    name: "Соня",
    score: 1840,
    caught: 9,
    best: "Судак",
    date: 0,
    bot: true,
  },
  {
    id: "bot-bream",
    name: "Лещ-Мастер",
    score: 1600,
    caught: 8,
    best: "Щука",
    date: 0,
    bot: true,
  },
  {
    id: "bot-pixel",
    name: "Пиксель",
    score: 1390,
    caught: 8,
    best: "Лещ",
    date: 0,
    bot: true,
  },
  {
    id: "bot-nastya",
    name: "Настя",
    score: 1190,
    caught: 7,
    best: "Карп",
    date: 0,
    bot: true,
  },
  {
    id: "bot-nil",
    name: "Старый Нил",
    score: 1010,
    caught: 7,
    best: "Карась",
    date: 0,
    bot: true,
  },
  {
    id: "bot-pike",
    name: "Щучка",
    score: 870,
    caught: 6,
    best: "Окунь",
    date: 0,
    bot: true,
  },
] as const;

const BOARD_SIZE = 10;
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
    return [...this.entries, ...BOTS].sort(compareEntries);
  }

  /** Top entries including the seeded rivals. */
  top(): LeaderboardEntry[] {
    return this.merged().slice(0, BOARD_SIZE);
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
      name: (name.trim() || "Рыбак").slice(0, 12),
      score: Math.round(result.score),
      caught: result.caught,
      best: result.bestFish?.name ?? "—",
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
}
