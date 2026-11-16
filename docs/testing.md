# Проверка

## Обязательный набор

```bash
pnpm typecheck
pnpm lint
pnpm check:structure
pnpm sim
pnpm check:assets
pnpm build
```

`pnpm check` = typecheck + lint + structure + sim. CI (`.github/workflows/deploy.yml`)
запускает `pnpm check`, `pnpm check:assets` и `pnpm build` перед публикацией.

## Sim-parity

`pnpm sim` компилирует `scripts/simulate-fight.ts` (TypeScript сам тянет граф) и
прогоняет 150 боёв на вид для политик skilled/pulse/hold/passive. Вывод
детерминирован: `Math.random` подменяется seeded-генератором.

Правило: при рефакторинге без изменения баланса вывод должен совпадать с baseline
побайтово. При намеренном изменении баланса обновляйте ожидаемые агрегаты в
`docs/gameplay.md`.

## Ручной smoke

- boot, меню, «Как играть», выбор водоёма, кодекс;
- три водоёма: заброс, зона удачи, поклёвка, подсечка, бой (удержание/отдых/контр/
  финальный рывок), улов, промах, сбежавшая рыба;
- пауза, кодекс из паузы, mute, смена водоёма, потеря фокуса;
- перезагрузка: водоём, прогресс, mute, погода;
- `F2`: предпросмотр, reset, copy (не «В КОД» во время проверки);
- `F3`: смена фронта;
- в Network нет запросов удалённых ассетов (rock/rod), консоль без новых ошибок.

## Бюджет загрузки

Ориентиры из README: меню ~0.4 МБ, `ice-480.webp` 99 КБ в фоне, звуки 4.9 МБ,
скриншоты помощи ~96 КБ на idle. Замер:

```bash
pnpm build && pnpm preview
pnpm measure
```

`scripts/measure-load.mjs` запускает свежий Chrome; `--throttle=fast3g` и
`--software` — для медленного профиля.
