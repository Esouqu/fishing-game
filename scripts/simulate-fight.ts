/**
 * Headless fight-balance check. It plays the real `FightModel` — the same code
 * the game uses — with three bots:
 *
 * - passive: never pulls, so the fish must tear free;
 * - hold: holds LMB with the cursor on the ring centre and never manages grip,
 *   modelling the "just hold and win" strategy;
 * - skilled: manages grip, rests through the telegraph, counters strong dashes
 *   and aims against the fish's movement.
 *
 * Run with `pnpm sim` (compiles the model to `.sim/` and executes it).
 */
import { FISH, type FishSpecies } from "../src/lib/fishing/config";
import { FightModel } from "../src/lib/fishing/game/fightModel";

type Policy = "passive" | "hold" | "pulse" | "skilled";

interface RunStats {
  won: boolean;
  perfect: boolean;
  time: number;
  maxOutside: number;
  finalEndurance: number;
  escapeMeter: number;
}

function makeRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(
  fish: FishSpecies,
  policy: Policy,
  seed: number,
  wildness = 1,
): RunStats {
  Math.random = makeRandom(seed);
  const model = new FightModel(fish, {
    anchor: { x: 255, y: 150 },
    wildness,
  });

  const dt = 1 / 60;
  let time = 0;
  let maxOutside = 0;
  let hold = policy !== "passive";
  let counterAim: number | null = null;
  let counterUntil = 0;

  model.setPointer(model.centerX, model.centerY);

  while (model.isRunning && time < 60) {
    if (policy === "passive") {
      hold = false;
    } else if (policy === "hold") {
      model.setPointer(model.centerX, model.centerY);
      hold = true;
      if (model.canLand) model.finalPull();
    } else if (policy === "pulse") {
      // A normal careful player: keeps the cursor in the centre and manages
      // grip, but does not read telegraphs or aim against the run.
      model.setPointer(model.centerX, model.centerY);
      if (model.isGripLocked) {
        hold = false;
      } else if (model.isOutside) {
        hold = true;
      } else if (model.gripValue < 0.3) {
        hold = false;
      } else if (model.gripValue > 0.65) {
        hold = true;
      }
      if (model.canLand) model.finalPull();
    } else {
      const point = model.fishPoint;

      // Regular grip and aim policy.
      if (model.isGripLocked) {
        hold = false;
      } else if (model.isOutside) {
        hold = true;
      } else if (model.gripValue < 0.3) {
        hold = false;
      } else if (model.gripValue > 0.65) {
        hold = true;
      }

      if (model.isOutside) {
        model.setPointer(model.centerX, model.centerY);
      } else {
        const velocity = model.fishVelocity;
        const speed = Math.hypot(velocity.x, velocity.y);
        if (speed > 12) {
          // Aim against the run so the pull actually opposes the fish.
          model.setPointer(
            point.x - (velocity.x / speed) * 60,
            point.y - (velocity.y / speed) * 60,
          );
        } else {
          model.setPointer(model.centerX, model.centerY);
        }
      }

      // Rest through the telegraph, then hold the counter-pull briefly.
      if (model.warn > 0) {
        hold = false;
        counterAim = model.warnHeading + Math.PI;
        counterUntil = 0;
      } else if (counterAim !== null) {
        if (counterUntil === 0) counterUntil = time + 0.22;
        if (time < counterUntil) {
          hold = true;
          model.setPointer(
            point.x + Math.cos(counterAim) * 45,
            point.y + Math.sin(counterAim) * 45,
          );
        } else {
          counterAim = null;
        }
      }

      if (model.canLand) model.finalPull();
    }

    model.setHold(hold);
    model.update(dt);
    time += dt;
    const distance = Math.hypot(
      model.fishPoint.x - model.centerX,
      model.fishPoint.y - model.centerY,
    );
    if (distance > maxOutside) maxOutside = distance;
  }

  const result = model.result;
  return {
    won: result?.won ?? false,
    perfect: result?.perfect ?? false,
    time,
    maxOutside,
    finalEndurance: model.enduranceValue,
    escapeMeter: model.escapeMeter,
  };
}

function summarize(label: string, runs: RunStats[]): void {
  const wins = runs.filter((run) => run.won).length;
  const perfect = runs.filter((run) => run.perfect).length;
  const time = runs.reduce((sum, run) => sum + run.time, 0) / runs.length;
  const outside =
    runs.reduce((sum, run) => sum + run.maxOutside, 0) / runs.length;
  const endurance =
    runs.reduce((sum, run) => sum + run.finalEndurance, 0) / runs.length;
  const rate = (wins / runs.length) * 100;
  console.log(
    `${label.padEnd(20)} win ${rate.toFixed(1).padStart(5)}%  ` +
      `perfect ${((perfect / runs.length) * 100).toFixed(1).padStart(5)}%  ` +
      `time ${time.toFixed(1).padStart(4)}s  ` +
      `max ${outside.toFixed(1).padStart(4)}px  ` +
      `endurance ${endurance.toFixed(2)}`,
  );
}

function winRate(runs: RunStats[]): number {
  return runs.filter((run) => run.won).length / runs.length;
}

const RUNS = 300;
const results: Record<Policy, RunStats[]> = {
  passive: [],
  hold: [],
  pulse: [],
  skilled: [],
};
const speciesRuns: Array<{
  fish: FishSpecies;
  passive: RunStats[];
  hold: RunStats[];
  pulse: RunStats[];
  skilled: RunStats[];
}> = [];

for (const fish of FISH) {
  const passive: RunStats[] = [];
  const hold: RunStats[] = [];
  const pulse: RunStats[] = [];
  const skilled: RunStats[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    passive.push(simulate(fish, "passive", 5000 + i * 13 + fish.points));
    hold.push(simulate(fish, "hold", 9000 + i * 11 + fish.points));
    pulse.push(simulate(fish, "pulse", 3000 + i * 17 + fish.points));
    skilled.push(simulate(fish, "skilled", 1000 + i * 7 + fish.points));
  }
  speciesRuns.push({ fish, passive, hold, pulse, skilled });
  results.passive.push(...passive);
  results.hold.push(...hold);
  results.pulse.push(...pulse);
  results.skilled.push(...skilled);
}

console.log(`\n${RUNS} fights per fish (wildness 1.0)\n`);
for (const entry of speciesRuns) {
  summarize(`${entry.fish.id} skilled`, entry.skilled);
  summarize(`${entry.fish.id} pulse`, entry.pulse);
  summarize(`${entry.fish.id} hold`, entry.hold);
  summarize(`${entry.fish.id} passive`, entry.passive);
}

console.log("");
summarize("ALL skilled", results.skilled);
summarize("ALL pulse", results.pulse);
summarize("ALL hold", results.hold);
summarize("ALL passive", results.passive);

function stickyAimCheck(): void {
  Math.random = makeRandom(42);
  const model = new FightModel(FISH[0], {
    anchor: { x: 255, y: 150 },
    wildness: 1,
  });
  // Establish a valid pull direction, then park the cursor on the fish.
  model.setPointer(model.centerX, model.centerY - 120);
  model.setHold(true);
  for (let i = 0; i < 30; i += 1) model.update(1 / 60);
  const gripBefore = model.gripValue;
  const fish = model.fishPoint;
  model.setPointer(fish.x, fish.y);
  let steering = false;
  for (let i = 0; i < 10; i += 1) {
    model.update(1 / 60);
    steering = steering || model.isSteering;
  }
  const gripAfter = model.gripValue;
  const passed = steering && gripAfter < gripBefore;
  console.log(
    `sticky aim          ${passed ? "OK" : "FAIL"}  ` +
      `grip ${gripBefore.toFixed(2)} -> ${gripAfter.toFixed(2)}`,
  );
  if (!passed) {
    throw new Error(
      "sticky aim stopped pulling when the cursor reached the fish",
    );
  }
}

stickyAimCheck();

const holdRate = winRate(results.hold);
const pulseRate = winRate(results.pulse);
const skilledRate = winRate(results.skilled);
const passiveRate = winRate(results.passive);
const weakSkilled = speciesRuns
  .filter((entry) => winRate(entry.skilled) < 0.7)
  .map((entry) => entry.fish.id);

console.log("");
if (passiveRate > 0.01) {
  throw new Error(
    `passive bot should lose, got ${(passiveRate * 100).toFixed(1)}%`,
  );
}
if (holdRate < 0.2) {
  throw new Error(
    `hold-centre bot is too weak: ${(holdRate * 100).toFixed(1)}% wins`,
  );
}
if (holdRate > 0.4) {
  throw new Error(
    `hold-centre bot is too strong: ${(holdRate * 100).toFixed(1)}% wins`,
  );
}
if (pulseRate < 0.7 || pulseRate > 0.87) {
  throw new Error(
    `pulse-centre bot outside 70-87%: ${(pulseRate * 100).toFixed(1)}% wins`,
  );
}
if (skilledRate < 0.9) {
  throw new Error(
    `skilled bot is too weak: ${(skilledRate * 100).toFixed(1)}% wins`,
  );
}
if (weakSkilled.length > 0) {
  throw new Error(`skilled bot under 70% for: ${weakSkilled.join(", ")}`);
}
console.log("balance OK: hold is risky, pulse works, skilled play wins");
