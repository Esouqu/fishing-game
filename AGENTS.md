# AGENTS guide — Зимняя рыбалка

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
| `pnpm check:structure` | большие файлы в отчёт, запрет старых шимов, циклы импортов, ссылки docs |
| `pnpm sim` | headless-баланс боя и валидация 40 видов |
| `pnpm check` | typecheck + lint + structure + sim |
| `pnpm build` | typecheck + production-сборка в `dist/` |
| `pnpm check:assets` | наличие ассетов для GitHub Pages |

## Карта кода

```
src/main.ts                 страница-хост
src/lib/fishing/index.ts    публичный API (createFishingGame)
src/lib/fishing/Game*.ts    жизненный цикл, boot, ввод, dev-панели, экраны
src/lib/fishing/screens/    меню, игра, помощь, кодекс
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
- Размер файла — запах, а не правило: делим по реальному шву (сцена/подсистема/этап),
  а не по числу строк. `pnpm check:structure` лишь перечисляет модули крупнее 500 строк.
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
| Стиль UI: обводки, отступы попапов, шрифты | [docs/style-guide.md](docs/style-guide.md) |
| Встраивание в Svelte/HTML | [docs/embedding.md](docs/embedding.md) |

## Workflow

1. Прочитать только нужный doc из таблицы.
2. Внести изменение, не расширяя публичный API без причины.
3. Прогнать проверки по типу правки — полный `pnpm check` нужен перед коммитом,
   а не на каждой итерации.
4. Если изменились границы модулей — обновить `docs/modules.md` и, при необходимости, этот файл.

| Что правили | Проверки |
| --- | --- |
| только `docs/**` и `AGENTS.md` | `pnpm check:structure` — он же проверяет ссылки в docs |
| `src/**`, `scripts/**`, конфиги | `pnpm typecheck` на итерацию, `pnpm check` перед коммитом |
| `fish/`, `fight/`, `FightModel`, баланс | то же + `pnpm sim`, вывод сравнить с baseline ([docs/testing.md](docs/testing.md)) |
| ассеты, `audioMix.ts`, публикация | то же + `pnpm check:assets`, перед деплоем `pnpm build` |

`pnpm sim` компилирует в `.sim/`, поэтому ему нужно право записи в рабочую папку.
