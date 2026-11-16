# Agent guide — Зимняя рыбалка

Пиксельная рыбалка на PixiJS 8 + TypeScript + Vite. Три водоёма, 40 видов, HUD и меню
отрисованы в PixiJS. `src/lib/FishingGame.svelte` — опциональная consumer-side обёртка,
этот репозиторий её не собирает (Svelte здесь не зависимость).

## Быстрый старт

```bash
pnpm install
pnpm assets   # только если есть assetspacks/; без него игра не найдёт текстуры
pnpm dev
```

## Проверки

| Команда | Зачем |
| --- | --- |
| `pnpm typecheck` | TypeScript |
| `pnpm lint` | ESLint + Prettier |
| `pnpm check:structure` | лимит 400 строк, запрет старых шимов, циклы импортов, ссылки docs |
| `pnpm sim` | headless-баланс боя и валидация 40 видов |
| `pnpm check` | typecheck + lint + structure + sim |
| `pnpm build` | typecheck + production-сборка в `dist/` |
| `pnpm check:assets` | наличие ассетов для GitHub Pages |

## Карта кода

```
src/main.ts                 страница-хост
src/lib/fishing/index.ts    публичный API (createFishingGame)
src/lib/fishing/Game*.ts    жизненный цикл, boot, ввод, dev-панели, экраны
src/lib/fishing/screens/    меню, выбор водоёма, игра, помощь, кодекс
src/lib/fishing/game/       CastFlow, Scene, Minigame, FightModel, Atmosphere
src/lib/fishing/ui/         HUD, кнопки, тема, панели, кодекс
src/lib/fishing/fish/       данные 40 видов и запросы
src/lib/fishing/world/      погода, палитра, WorldClock
src/lib/fishing/audio/      Web Audio, каталог звуков, эмбиент
src/lib/fishing/fight/      чистая симуляция боя
```

Правило зависимостей: `screens`/`ui`/`game` знают только `GameContext`, а не класс `Game`.
Данные (`fish/`, `world/`, `config`, `areas`, `texts`) не должны импортировать UI.

## Жёсткие правила

- Виртуальный экран — 480×270; вся раскладка в этих единицах.
- Не переименовывать id водоёмов `cove` / `deep` / `rapids`: на них завязаны сохранения.
- Не двигать `src/lib/fishing/audioMix.ts` и маркеры `// #region audio-mix`: в них пишет dev-плагин Vite.
- Публичный API `src/lib/fishing/index.ts` и пропсы `FishingGame.svelte` менять только осознанно.
- Файл `.ts` — не больше 400 строк; это проверяет `pnpm check:structure`.
- Новые runtime-зависимости — только с обоснованием. Ассеты не коммитить вручную: `pnpm assets`.
- `pnpm sim` — оракул поведения боя. При правке `FightModel` его вывод должен совпадать,
  если баланс не менялся намеренно.

## Куда читать дальше

| Нужно | Документ |
| --- | --- |
| Понять слои, boot и поток раунда | [docs/architecture.md](docs/architecture.md) |
| Найти модуль и границы | [docs/modules.md](docs/modules.md) |
| Правила боя, погоды, клёва | [docs/gameplay.md](docs/gameplay.md) |
| Схема прогресса, репозитории, миграции | [docs/data-and-progress.md](docs/data-and-progress.md) |
| Ассеты, шрифты, звук, dev-панели | [docs/assets-and-audio.md](docs/assets-and-audio.md) |
| Команды, sim-parity, smoke-чеклист | [docs/testing.md](docs/testing.md) |
| Стиль, лимиты, public API | [docs/conventions.md](docs/conventions.md) |
| Встраивание в Svelte/HTML | [docs/embedding.md](docs/embedding.md) |

## Workflow

1. Прочитать только нужный doc из таблицы.
2. Внести изменение, не расширяя публичный API без причины.
3. `pnpm check`; при правке рыб/боя — сравнить `pnpm sim` с baseline.
4. Если изменились границы модулей — обновить `docs/modules.md` и, при необходимости, этот файл.
