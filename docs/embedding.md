# Встраивание

## Без Svelte

```ts
import { createFishingGame } from "./lib/fishing";

const game = await createFishingGame({
  container: document.getElementById("game")!,
  assetBase: `${import.meta.env.BASE_URL}assets/fishing`,
  storagePrefix: "quiet-cove",
  onCatch: (event) => console.log(event),
});

await game.flushProgress();
game.destroy();
```

Опции: `container` (обязательно), `assetBase`, `storagePrefix`, `muted`,
`startScreen` (`menu` | `game`), `progress`, `locations`, `onExit`, `onCatch`,
`onProgress`, `onReady`. Методы: `restart`, `pause`, `resume`, `showMenu`,
`setMuted`, `setLocations`, `flushProgress`, `destroy`.

## Закрытые водоёмы

`locations` закрывает уровень до начала игры: `false` напротив id водоёма
(`cove` — бухта, `deep` — омут, `rapids` — плёс). Всё, что не перечислено,
остаётся открытым.

```ts
const game = await createFishingGame({
  container: document.getElementById("game")!,
  locations: { cove: false }, // бухта закрыта, омут и плёс открыты
});

// После покупки/разблокировки — на ходу, без перезапуска:
game.setLocations({ cove: true });
```

Закрытый водоём не исчезает с экрана: в раунде его карточка-мини-превью в углу
остаётся, но вместо кадра воды, названия и погоды на ней запаянная плитка с
замком и надписью «НЕДОСТУПНО», и переход по ней заблокирован. Игра никогда не
стартует на закрытом водоёме: сохранённый выбор откатывается на первый открытый,
а `startGame(areaId)` с закрытым id открывает первый доступный.

## Svelte

`src/lib/FishingGame.svelte` — Svelte 5 (runes) обёртка. Она динамически импортирует
движок, поэтому безопасна для SSR. **Этот репозиторий её не собирает**: Svelte не
входит в зависимости, Vite-плагина для `.svelte` нет. Обёртка предназначена для
копирования в Svelte-приложение.

Пропсы: `assetBase`, `storagePrefix`, `muted`, `startScreen`, `progress`,
`locations`, `onExit`, `onCatch`, `onProgress`, `onReady`, `class`.
Экспортируемые методы: `restart`, `pause`, `resume`, `showMenu`, `setMuted`,
`setLocations`, `flushProgress`.

## Прогресс в БД

```ts
import { createFishingGame, createHttpProgressRepository } from "./lib/fishing";

const game = await createFishingGame({
  container: document.getElementById("game")!,
  progress: createHttpProgressRepository({
    loadUrl: "/api/progress", // GET  -> ProgressSnapshot | null
    saveUrl: "/api/progress", // PUT  <- ProgressSnapshot
    headers: { Authorization: `Bearer ${token}` },
  }),
});
```

Свой репозиторий — объект с `load(): Promise<unknown>` и
`save(snapshot): Promise<void>`. Сохранение дебаунсится, сериализуется и повторяется
при ошибке.
