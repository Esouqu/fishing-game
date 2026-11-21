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
    GameDevLayer.ts             F2/F3/F8 панели, setWeather, setTimeOfDay
    GameScreensLayer.ts         навигация и публичные действия
    GameContext.ts              узкий контракт хоста
    options.ts  types.ts  progress.ts  storage.ts
    assets.ts  fonts.ts  cursors.ts  fullscreen.ts  inputProfile.ts  renderScale.ts
    fish/                       species, rosters by area, tiers, activity, labels, validate,
                                pearls, platinum, shell
    world/                      weather, colors, WorldClock
    audio/                      catalog, core, cues, loops, ambience, AudioKit
    audioMix.ts                 таблица громкостей + маркеры audio-mix
    areas.ts  config.ts  texts.ts  utils.ts
    game/
      CastFlow.ts               фасад фазы раунда
      cast/                     core, input, state, setup
      fight/                    FightModel, motion, stamina, counter, bubbles, zone, pace, pause, zoneTuning
      fightView/                ring, warning, bars, Minigame, zoneClock, zoneWedge
      pearl/                    art.ts, PearlView (шейдер), PearlReveal
      scenes/
        FishingScene.ts         фасад
        stage/                  core, angler, cast, fx, catch, burst, biteMark
        dither.ts grass.ts props.ts water*.ts cloudShadow.ts
        logs/  river/  cove/  pool/
      Atmosphere.ts             фасад
      AtmosphereBase/Sky/Snow.ts
      auroraTex.ts              два бесшовных полотна сияния
      shinyShader.ts  platinumShader.ts   окрас шайни и платина слота
      behaviors.ts  castAim.ts  castPick.ts  castSafety.ts  fog.ts
      FightStage.ts  FightFocus.ts  fightRing.ts  JuiceFx.ts
    screens/
      GameScreen.ts             фасад
      game/                     core + overlays
      MenuScreen.ts  HelpScreen.ts  CodexScreen.ts
    ui/
      theme.ts  Button.ts  palette.ts  tier.ts  Screen.ts  ScreenManager.ts  metrics.ts
      rect.ts                         прямоугольники: пересечение и зазор
      weatherRail.ts  railCard.ts     полоса погоды: строка и её карточки
      CastHint.ts  holdIcon.ts        подсказка заброса и значок «зажми ЛКМ»
      HelpCard.ts  richCopy.ts        справка: попап и подсветка копии
      TutorialHint.ts                 записка обучения: раскладка вокруг боя
      fight/                    FightControls, grabGesture (тач)
      mix/                      AudioMixPanel + MixRow + layout
      codex/                    CodexView + реестр + карточка записи + devPreview
      остальные HUD/панели/курсор/фон
```

## Куда добавлять

| Задача | Куда |
| --- | --- |
| Новый вид рыбы | `fish/roster-<area>.ts`, `FISH_TEXT`, `FISH_TEMPERAMENT`, `behaviors.ts` |
| Новый сорт жемчуга | `fish/pearls.ts`, `PEARL_TEXT`, ячейка 16×16 в `public/assets/fishing/pearls-sheet.png` |
| Новая погода | `world/weather.ts`, `world/colors.ts`, `game/Atmosphere*`, `audio/catalog.ts` |
| Новый водоём | `areas.ts`, `game/scenes/<id>/`, `game/scenes/index.ts`, `audio/catalog.ts` |
| Новый звук | `audio/catalog.ts` + `scripts/sync-assets.mjs` |
| Новый экран | `screens/`, регистрация в `GameScreensLayer` |
| Новый HUD-виджет | `ui/`, композиция в `screens/game/GameScreenCore.ts` |
| Новое правило боя | `game/fight/`; сначала проверить `pnpm sim` |
| Новая настройка/сохранение | `types.ts`, `progress.ts` или `storage.ts` |

## Правила

- Размер файла — запах, а не лимит: делим по шву, `pnpm check:structure` отмечает модули
  крупнее 500 строк.
- `Game` не импортируется экранами: только `GameContext`.
- Публичный API — только `src/lib/fishing/index.ts`; всё остальное внутреннее.
- Стиль UI (обводки, отступы попапов, шрифты, состояния) — [style-guide.md](style-guide.md).
- В `audioMix.ts` не удалять маркеры `// #region audio-mix` / `// #endregion audio-mix`.
- `FishingGame.svelte` не входит в сборку этого репозитория.
