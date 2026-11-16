# Модули

## Дерево

```
src/
  main.ts                       standalone-хост страницы
  lib/FishingGame.svelte        consumer-side Svelte-обёртка (не собирается здесь)
  lib/fishing/
    index.ts                    публичный API
    Game.ts                     Game + destroy + create
    GameBase.ts                 поля, конструктор, accessors, ввод-хуки
    GameBootLayer.ts            boot, previews, boot-сцена
    GameInputLayer.ts           layout/resize, курсор
    GameDevLayer.ts             F2/F3 панели, setWeather
    GameScreensLayer.ts         навигация и публичные действия
    GameContext.ts              узкий контракт хоста
    options.ts  types.ts  progress.ts  storage.ts
    assets.ts  fonts.ts  cursors.ts
    fish/                       species, rosters by area, tiers, activity, labels, validate
    world/                      weather, colors, WorldClock
    audio/                      catalog, core, cues, loops, ambience, AudioKit
    audioMix.ts                 таблица громкостей + маркеры audio-mix
    audioMixSave.ts             запись микса в код/буфер/файл
    areas.ts  config.ts  texts.ts  utils.ts
    game/
      CastFlow.ts               фасад фазы раунда
      cast/                     core, input, state, setup
      fight/                    FightModel, motion, stamina, counter, bubbles, zone
      fightView/                ring, warning, bars, Minigame
      scenes/
        FishingScene.ts         фасад
        stage/                  core, angler, cast, fx, catch
        dither.ts grass.ts noise.ts props.ts water.ts
        logs/  river/  cove/  pool/
      Atmosphere.ts             фасад
      AtmosphereBase/Sky/Snow.ts
      behaviors.ts  castPick.ts  castSafety.ts  fog.ts
      FightStage.ts  FightFocus.ts  fightRing.ts  JuiceFx.ts
    screens/
      GameScreen.ts             фасад
      game/                     core + overlays
      MenuScreen.ts  HelpScreen.ts  AreaSelectScreen.ts  CodexScreen.ts
    ui/
      theme.ts  Button.ts  palette.ts  tier.ts  Screen.ts  ScreenManager.ts
      mix/                      AudioMixPanel + MixRow + layout
      codex/                    CodexView + grid + tooltip
      остальные HUD/панели/курсор/фон
```

## Куда добавлять

| Задача | Куда |
| --- | --- |
| Новый вид рыбы | `fish/roster-<area>.ts`, `FISH_TEXT`, `FISH_TEMPERAMENT`, `behaviors.ts` |
| Новый водоём | `areas.ts`, `game/scenes/<id>/`, `game/scenes/index.ts`, `audio/catalog.ts` |
| Новый звук | `audio/catalog.ts` + `scripts/sync-assets.mjs` |
| Новый экран | `screens/`, регистрация в `GameScreensLayer` |
| Новый HUD-виджет | `ui/`, композиция в `screens/game/GameScreenCore.ts` |
| Новое правило боя | `game/fight/`; сначала проверить `pnpm sim` |
| Новая настройка/сохранение | `types.ts`, `progress.ts` или `storage.ts` |

## Правила

- 400 строк на `.ts`; `pnpm check:structure`.
- `Game` не импортируется экранами: только `GameContext`.
- Публичный API — только `src/lib/fishing/index.ts`; всё остальное внутреннее.
- В `audioMix.ts` не удалять маркеры `// #region audio-mix` / `// #endregion audio-mix`.
- `FishingGame.svelte` не входит в сборку этого репозитория.
