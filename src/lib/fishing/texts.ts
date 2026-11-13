import type { LeaderboardEntry } from "./types";

export interface FishText {
  name: string;
  latin: string;
}

/** Names shown on the catch card, results screen and leaderboard. */
export const FISH_TEXT = {
  bluegill: { name: "Солнечник", latin: "Bluegill" },
  capelin: { name: "Шэд", latin: "Capelin" },
  sardine: { name: "Сардина", latin: "Sardine" },
  flounder: { name: "Песковник", latin: "Flounder" },
  tilapia: { name: "Тиляпия", latin: "Tilapia" },
  carp: { name: "Карп", latin: "Carp" },
  angelfish: { name: "Лещ", latin: "Angelfish" },
  largemouthbass: { name: "Большеротый окунь", latin: "Largemouth Bass" },
  chub: { name: "Голавль", latin: "Chub" },
  smallmouthbass: { name: "Лесоплюх", latin: "Smallmouth Bass" },
  rainbowtrout: { name: "Тигровая форель", latin: "Rainbow Trout" },
  cod: { name: "Сомик", latin: "Cod" },
  walleye: { name: "Желтый судак", latin: "Walleye" },
  catfish: { name: "Сом", latin: "Catfish" },
  eel: { name: "Угорь", latin: "Eel" },
  grouper: { name: "Пятнистый криворот", latin: "Grouper" },
  redsnapper: { name: "Берикс", latin: "Red Snapper" },
  lionfish: { name: "Иглобрюх", latin: "Lionfish" },
  tuna: { name: "Тунец", latin: "Tuna" },
  sturgeon: { name: "Осетр", latin: "Sturgeon" },
} satisfies Record<string, FishText>;

export interface HelpLine {
  text: string;
  y: number;
  bullet?: boolean;
  color?: number;
  size?: number;
}

export interface HelpSection {
  title: string;
  y: number;
  lines: readonly HelpLine[];
}

export type HelpPageId = "cast" | "fight" | "counter" | "land";

export interface HelpPage {
  id: HelpPageId;
  title: string;
  lines: readonly string[];
  caption: string;
}

/** Paged fishing manual: one short lesson and one preview per page. */
export const HELP_PAGES: readonly HelpPage[] = [
  {
    id: "cast",
    title: "ЗАБРОС",
    lines: [
      "Зажми ЛКМ или ПРОБЕЛ.",
      "Отпусти в зеленой зоне.",
      "Зеленая зона — бонус к редкой рыбе.",
      "На «!» жми сразу.",
    ],
    caption: "ШКАЛА СИЛЫ И ПОКЛЕВКА",
  },
  {
    id: "fight",
    title: "БОРЬБА",
    lines: [
      "Держи рыбу внутри круга.",
      "Тяни против ее хода.",
      "Зеленая полоса — выносливость рыбы.",
      "Синяя полоса — ваша хватка.\nЭто запас сил: держишь — тратится.\nОтпустишь — восстановится.",
    ],
    caption: "КРУГ, РЫБА И ПОЛОСЫ",
  },
  {
    id: "counter",
    title: "КОНТРРЫВОК",
    lines: [
      "На рывке отпусти.",
      "Затем тяни в обратную.",
      "Контр блокирует рывок.",
    ],
    caption: "ПРЕДУПРЕЖДЕНИЕ О РЫВКЕ",
  },
  {
    id: "land",
    title: "ПОИМКА",
    lines: [
      "Золотой круг — рыба готова к поимке.",
      "Можно выловить сразу:\nПКМ или F.",
      "Или дождаться 0 — тогда сама.",
      "Очки: рыба × вес × серия × бонус.",
      "Вес виден после поимки.",
    ],
    caption: "ГОТОВО К ПОИМКЕ",
  },
];

/** Full "Как играть" content: edit text here, layout stays with it. */
export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    title: "УПРАВЛЕНИЕ",
    y: 54,
    lines: [
      {
        text: "ЗАБРОС — зажми ЛКМ или ПРОБЕЛ, отпусти в нужный момент",
        y: 68,
      },
      {
        text: "ПОКЛЕВКА — жми, как только над поплавком появится «!»",
        y: 81,
      },
      {
        text: "ВЫВАЖИВАНИЕ — держи ЛКМ/пробел и веди прицел; отпусти — отдых",
        y: 94,
      },
      {
        text: "ФИНАЛ — когда рыба выдохлась в зоне, она вылавливается сама",
        y: 107,
      },
      {
        text: "РАНО ПОДСЕКЕШЬ — рыба уйдет, а заброс вернется",
        y: 120,
      },
    ],
  },
  {
    title: "МИР И ЛОВЛЯ",
    y: 134,
    lines: [
      {
        text: "КРУГ — волнистая граница; рыба рвется наружу, тяни ее внутрь",
        y: 145,
        bullet: true,
        size: 9,
      },
      {
        text: "КОНТР — на рывке отпусти, затем тяни в обратную сторону",
        y: 155,
        bullet: true,
        size: 9,
      },
      {
        text: "ПОЛОСЫ — выносливость сверху, хватка снизу; не выжимай до нуля",
        y: 165,
        bullet: true,
        size: 9,
      },
      {
        text: "ЧЕМ ДОЛЬШЕ РЫБА СНАРУЖИ, ТЕМ НИЖЕ ПОПЛАВОК И ТУЖЕ ЛЕСКА",
        y: 175,
        bullet: true,
        size: 9,
      },
      {
        text: "ВЕС — показывается только после поимки",
        y: 185,
        bullet: true,
        size: 9,
      },
      {
        text: "ЗОНА УДАЧИ И ПОГОДА — влияют на клев и редкость рыбы",
        y: 195,
        bullet: true,
        size: 9,
      },
      {
        text: "ОЧКИ = рыба × вес × комбо × бонус; идеально — не больше 2 срывов",
        y: 205,
        bullet: true,
        size: 9,
      },
      {
        text: "ТЯГА — веди прицел против хода рыбы: так она устает быстрее",
        y: 215,
        bullet: true,
        size: 9,
      },
    ],
  },
];

export interface HintRow {
  label: string;
  keys: readonly string[];
}

export const HINT_ROWS: readonly HintRow[] = [
  { label: "Тяга", keys: ["ЛКМ", "ПРОБЕЛ"] },
  { label: "Отдых", keys: ["ОТПУСТИ"] },
  { label: "Рывок", keys: ["СТРЕЛКА"] },
  { label: "Контр", keys: ["ОТПУСТИ"] },
];

/** Seeded rival names and their best fish; edit freely. */
export const SEED_LEADERBOARD: readonly LeaderboardEntry[] = [
  {
    id: "bot-marina",
    name: "Марина",
    score: 3180,
    caught: 10,
    best: FISH_TEXT.sturgeon.name,
    date: 0,
    bot: true,
  },
  {
    id: "bot-cat",
    name: "Кот-Рыбак",
    score: 2760,
    caught: 10,
    best: FISH_TEXT.tuna.name,
    date: 0,
    bot: true,
  },
  {
    id: "bot-cove",
    name: "Тихий Плес",
    score: 2430,
    caught: 10,
    best: FISH_TEXT.redsnapper.name,
    date: 0,
    bot: true,
  },
  {
    id: "bot-fedor",
    name: "Дядя Федор",
    score: 2110,
    caught: 9,
    best: FISH_TEXT.catfish.name,
    date: 0,
    bot: true,
  },
  {
    id: "bot-sonya",
    name: "Соня",
    score: 1840,
    caught: 9,
    best: FISH_TEXT.eel.name,
    date: 0,
    bot: true,
  },
  {
    id: "bot-bream",
    name: "Лещ-Мастер",
    score: 1600,
    caught: 8,
    best: FISH_TEXT.chub.name,
    date: 0,
    bot: true,
  },
  {
    id: "bot-pixel",
    name: "Пиксель",
    score: 1390,
    caught: 8,
    best: FISH_TEXT.angelfish.name,
    date: 0,
    bot: true,
  },
  {
    id: "bot-nastya",
    name: "Настя",
    score: 1190,
    caught: 7,
    best: FISH_TEXT.carp.name,
    date: 0,
    bot: true,
  },
  {
    id: "bot-nil",
    name: "Старый Нил",
    score: 1010,
    caught: 7,
    best: FISH_TEXT.tilapia.name,
    date: 0,
    bot: true,
  },
  {
    id: "bot-pike",
    name: "Щучка",
    score: 870,
    caught: 6,
    best: FISH_TEXT.cod.name,
    date: 0,
    bot: true,
  },
  {
    id: "bot-bal",
    name: "Баллада",
    score: 990,
    caught: 9,
    best: FISH_TEXT.chub.name,
    date: 0,
    bot: true,
  },
  {
    id: "bot-groz",
    name: "Гроза",
    score: 1080,
    caught: 9,
    best: FISH_TEXT.carp.name,
    date: 0,
    bot: true,
  },
  {
    id: "bot-fred",
    name: "Фред",
    score: 1220,
    caught: 8,
    best: FISH_TEXT.angelfish.name,
    date: 0,
    bot: true,
  },
  {
    id: "bot-kalin",
    name: "Калин",
    score: 1450,
    caught: 8,
    best: FISH_TEXT.catfish.name,
    date: 0,
    bot: true,
  },
  {
    id: "bot-olga",
    name: "Ольга",
    score: 1680,
    caught: 7,
    best: FISH_TEXT.cod.name,
    date: 0,
    bot: true,
  },
];

/**
 * Every visible string in the game lives here. Components read from this
 * object, so changing copy does not require touching layout code.
 */
const PERFECT_LABEL = "ИДЕАЛЬНО";
const KG = "кг";

export const TEXT = {
  page: {
    title: "Зимняя рыбалка",
    description:
      "Зимняя рыбалка — пиксельная рыбалка на 10 забросов с комбо и таблицей лидеров.",
  },
  common: {
    back: "НАЗАД",
    menu: "В МЕНЮ",
    again: "ЕЩЕ РАЗ",
    play: "ИГРАТЬ",
    howToPlay: "КАК ИГРАТЬ",
    exit: "ВЫХОД",
    soundOn: "ЗВУК: ВКЛ",
    soundOff: "ЗВУК: ВЫКЛ",
    pause: "ПАУЗА",
    resume: "ПРОДОЛЖИТЬ",
    restart: "ЗАНОВО",
    reset: "СБРОС",
    resetConfirm: "ТОЧНО?",
    score: "ОЧКИ",
    playerFallback: "Рыбак",
    ariaLabel: "Игра «Зимняя рыбалка»",
    dash: "—",
    ellipsis: "…",
    kg: KG,
  },
  menu: {
    title: "ЗИМНЯЯ РЫБАЛКА",
    leaderboardTitle: "ТАБЛИЦА ЛИДЕРОВ",
  },
  hud: {
    scoreZero: "0",
    casts: (used: number, total: number): string => `ЗАБРОС ${used}/${total}`,
    remaining: (left: number): string => `ПОПЫТОК ОСТАЛОСЬ ${left}`,
    streak: (value: number, multiplier?: number): string =>
      value > 0 && multiplier
        ? `СЕРИЯ ${value} (x${multiplier})`
        : `СЕРИЯ ${value}`,
    power: "СИЛА",
  },
  game: {
    biteMark: "!",
    readyToCast: "ЗАБРОС",
    castKey: "ЛКМ",
    earlyHook: "РАНО! РЫБА УШЛА",
    lostFish: "СОРВАЛАСЬ…",
    missedHook: "НЕ УСПЕЛ ПОДСЕЧЬ",
    streakBroken: (value: number): string => `СЕРИЯ ${value} ПРЕРВАНА`,
    perfect: PERFECT_LABEL,
    catchFeedback: (
      name: string,
      points: number,
      multiplier: number,
      weight: string,
      perfect: boolean,
    ): string =>
      `${name.toUpperCase()}  +${points}${multiplier > 1 ? ` ×${multiplier}` : ""}\n${weight} ${KG}${perfect ? ` · ${PERFECT_LABEL}` : ""}`,
  },
  results: {
    title: "УЛОВ ГОТОВ",
    top10: (rank: number): string => `ТЫ В ТОП-10 · МЕСТО ${rank}`,
    outsideTop10: (rank: number): string =>
      `МЕСТО ${rank} · ДО ТОП-10 НЕ ХВАТИЛО`,
    caught: "ПОЙМАНО",
    perfectLabel: "ИДЕАЛЬНЫХ",
    best: "ЛУЧШАЯ",
    bestCatch: "ЛУЧШАЯ РЫБА",
    catchStrip: "УЛОВ",
    streak: "СЕРИЯ",
    weight: "ВЕС",
    empty: "СЕГОДНЯ БЕЗ РЫБЫ",
    caughtValue: (caught: number, casts: number): string =>
      `${caught}/${casts}`,
    bestValue: (name: string, points: number): string => `${name} +${points}`,
    streakValue: (streak: number, multiplier: string): string =>
      `${streak} · ${multiplier}`,
  },
  leaderboard: {
    title: "ТАБЛИЦА ЛИДЕРОВ",
    subtitle: (count: number): string => `ТОП-${count} · ЛОКАЛЬНЫЙ РЕЙТИНГ`,
    headerRank: "#",
    headerName: "ИМЯ",
    headerCaught: "УЛОВ",
    caught: (caught: number, total: number): string => `${caught}/${total}`,
  },
  help: {
    title: "КАК ИГРАТЬ",
    prev: "ПРЕД.",
    next: "ДАЛЕЕ",
    page: (index: number, total: number): string => `${index} / ${total}`,
  },
  hint: {
    rows: HINT_ROWS,
  },
  fight: {
    counter: "КОНТР",
  },
  boot: {
    font: "ШРИФТ",
    loading: "ЗАГРУЗКА",
  },
  fish: FISH_TEXT,
} as const;
