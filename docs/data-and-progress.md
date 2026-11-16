# Данные и прогресс

## Виды рыб

`fish/species.ts` — `FishSpecies`: id, имя, вес, spawn weight, speed, resistance,
tint, tier, area, behavior, окна, погода. Ростер разбит по водоёмам:
`roster-lake.ts` (16), `roster-river.ts` (12), `roster-sea.ts` (12) → `roster.ts`.

- `tiers.ts` — `TIER_SHARE` и `TIER_WEIGHT`.
- `temperament.ts` — фиксированный характер каждого вида.
- `labels.ts` — окна, погода, описание для кодекса.
- `validate.ts` — `validateFishData`; вызывается `pnpm sim` и dev-boot.

## ProgressSnapshot

```ts
interface ProgressSnapshot {
  version: number;
  selectedArea: "cove" | "deep" | "rapids";
  fish: Record<string, { caught: number; bestKg: number }>;
  updatedAt: number;
}
```

`ProgressTracker` дебаунсит сохранение (500 мс), сериализует записи и повторяет при
ошибке. `flushProgress()` форсирует отправку.

`ProgressRepository` — `load(): Promise<unknown>`, `save(snapshot): Promise<void>`.
Готовые адаптеры: `LocalProgressRepository`, `MemoryProgressRepository`,
`createHttpProgressRepository`. Публичный API — `src/lib/fishing/index.ts`.

## Ключи localStorage

| Ключ | Что |
| --- | --- |
| `<prefix>:progress:v1` | прогресс справочника и выбранный водоём |
| `<prefix>:settings:v1` | mute, dev-оверрайды микса |
| `<prefix>:world:v1` | погодные фронты по водоёмам |

`prefix` по умолчанию `quiet-cove`, переопределяется опцией `storagePrefix`.

## Миграции

- id водоёмов исторические: `deep` (озеро), `rapids` (река), `cove` (море);
  не переименовывать.
- старые погодные id `rain`/`storm` переводятся в `snow`/`blizzard` в
  `world/WorldClock.ts`.
- `parseProgress` чистит неизвестные поля и битые записи; версия схемы — 2.

При изменении схемы добавляйте миграцию в `progress.ts` и обновляйте этот документ.
