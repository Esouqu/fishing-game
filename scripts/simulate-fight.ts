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
import {
  FIGHT,
  FISH,
  validateFishData,
  type FishSpecies,
} from "../src/lib/fishing/config";
import { isWindowActive } from "../src/lib/fishing/fish";
import { hasBehaviorScript } from "../src/lib/fishing/game/behaviors";
import { FightModel } from "../src/lib/fishing/game/fight";

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
  /**
   * Where the catch weight sits inside the species range: 0 the lightest, 1 the
   * heaviest, 0.5 the neutral middle the fight is balanced around.
   */
  weightFraction = 0.5,
): RunStats {
  Math.random = makeRandom(seed);
  const [min, max] = fish.weightKg;
  const model = new FightModel(fish, {
    anchor: { x: 255, y: 150 },
    weightKg: min + (max - min) * weightFraction,
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

      // Rest through the telegraph. A feint's arrow lies, so a skilled player
      // waits for the turn and only then pulls opposite the true heading.
      if (model.warn > 0) {
        hold = false;
        counterAim = model.isFeint ? null : model.counterHeading + Math.PI;
        counterUntil = 0;
      } else if (model.isFeint && model.feintRevealed) {
        if (counterAim === null) {
          counterAim = model.counterHeading + Math.PI;
          counterUntil = time + FIGHT.feintWindow;
        }
        if (time < counterUntil) {
          hold = true;
          model.setPointer(
            point.x + Math.cos(counterAim) * 45,
            point.y + Math.sin(counterAim) * 45,
          );
        } else {
          counterAim = null;
        }
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

function checkRoster(): void {
  const problems = validateFishData(hasBehaviorScript);
  if (problems.length > 0) {
    throw new Error(`fish data is invalid:\n- ${problems.join("\n- ")}`);
  }
  const night = { from: 22 * 60, to: 4 * 60 };
  if (!isWindowActive(night, 23 * 60)) {
    throw new Error("window wrap: 23:00 must be active in 22:00–04:00");
  }
  if (!isWindowActive(night, 2 * 60)) {
    throw new Error("window wrap: 02:00 must be active in 22:00–04:00");
  }
  if (isWindowActive(night, 12 * 60)) {
    throw new Error("window wrap: noon must not be active in 22:00–04:00");
  }
  console.log(
    `roster OK: ${FISH.length} species, three areas, windows wrap correctly`,
  );
}

checkRoster();

const RUNS = 150;
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

FISH.forEach((fish, fishIndex) => {
  const passive: RunStats[] = [];
  const hold: RunStats[] = [];
  const pulse: RunStats[] = [];
  const skilled: RunStats[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const seed = fishIndex * 101;
    passive.push(simulate(fish, "passive", 5000 + i * 13 + seed));
    hold.push(simulate(fish, "hold", 9000 + i * 11 + seed));
    pulse.push(simulate(fish, "pulse", 3000 + i * 17 + seed));
    skilled.push(simulate(fish, "skilled", 1000 + i * 7 + seed));
  }
  speciesRuns.push({ fish, passive, hold, pulse, skilled });
  results.passive.push(...passive);
  results.hold.push(...hold);
  results.pulse.push(...pulse);
  results.skilled.push(...skilled);
});

console.log(`\n${RUNS} fights per fish\n`);
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

/**
 * A feint must actually lie: the warning heading has to differ from the true
 * heading once the fish turns, otherwise the codex promise is flavour text.
 */
function feintCheck(): void {
  const fish = FISH.find((entry) => entry.id === "walleye") ?? FISH[0];
  let falseHeading = 0;
  let trueHeading = 0;
  let seen = false;
  // A single seed can miss the 55% roll and the fish can tear free before the
  // next strong dash, so search seeds until the first real feint appears.
  for (let seed = 1; seed <= 500 && !seen; seed += 1) {
    Math.random = makeRandom(seed * 13 + 7);
    const model = new FightModel(fish, { anchor: { x: 255, y: 150 } });
    model.setPointer(model.centerX, model.centerY);
    let time = 0;
    while (model.isRunning && time < 20 && !seen) {
      model.setHold(true);
      model.update(1 / 60);
      time += 1 / 60;
      if (model.isFeint && model.feintRevealed) {
        seen = true;
        falseHeading = model.warnHeading;
        trueHeading = model.counterHeading;
      }
    }
  }
  const delta = Math.abs(
    Math.atan2(
      Math.sin(falseHeading - trueHeading),
      Math.cos(falseHeading - trueHeading),
    ),
  );
  const passed = seen && delta > 0.5;
  console.log(
    `feint lie            ${passed ? "OK" : "FAIL"}  ` +
      (seen
        ? `false ${falseHeading.toFixed(2)} true ${trueHeading.toFixed(2)}`
        : "no feint"),
  );
  if (!passed) {
    throw new Error("a feint did not produce a false warning");
  }
}

feintCheck();

/**
 * The caught weight has to be felt: a fish rolled at the top of its species
 * range must be a harder, longer fight than one at the bottom, for the same
 * seeds and the same play. Checked on the careful pulse bot, which is the
 * closest stand-in for an ordinary player.
 */
function weightSwingCheck(): void {
  const light: RunStats[] = [];
  const heavy: RunStats[] = [];
  FISH.forEach((fish, fishIndex) => {
    const seed = fishIndex * 101;
    for (let i = 0; i < RUNS; i += 1) {
      const runSeed = 3000 + i * 17 + seed;
      light.push(simulate(fish, "pulse", runSeed, 0));
      heavy.push(simulate(fish, "pulse", runSeed, 1));
    }
  });
  const lightRate = winRate(light);
  const heavyRate = winRate(heavy);
  const mean = (runs: RunStats[], pick: (run: RunStats) => number): number =>
    runs.reduce((sum, run) => sum + pick(run), 0) / runs.length;
  const lightTime = mean(light, (run) => run.time);
  const heavyTime = mean(heavy, (run) => run.time);
  console.log(
    `weight swing        light ${(lightRate * 100).toFixed(1)}% in ` +
      `${lightTime.toFixed(1)}s   heavy ${(heavyRate * 100).toFixed(1)}% in ` +
      `${heavyTime.toFixed(1)}s`,
  );
  if (heavyRate > lightRate) {
    throw new Error(
      `heavy catches are easier than light ones: ${(heavyRate * 100).toFixed(1)}% ` +
        `vs ${(lightRate * 100).toFixed(1)}%`,
    );
  }
  if (heavyTime <= lightTime) {
    throw new Error(
      `heavy catches do not take longer: ${heavyTime.toFixed(1)}s vs ` +
        `${lightTime.toFixed(1)}s`,
    );
  }
}

weightSwingCheck();

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
