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
import {
  hasBehaviorScript,
  hasStrongDash,
} from "../src/lib/fishing/game/behaviors";
import { FIGHT_RADIUS, FightModel } from "../src/lib/fishing/game/fight";

type Policy = "passive" | "hold" | "pulse" | "skilled" | "tap";

interface RunStats {
  won: boolean;
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

/** Distance past the rim the warning arrow is drawn at; the grab target. */
const ARROW_REACH = FIGHT_RADIUS + 9;

/**
 * One frame of the counter gesture: the first frame puts the cursor on the
 * arrow (that press is the grab), the next drags it toward the middle of the
 * ring. Returns the stage to carry into the next frame.
 */
function counterFrame(
  model: FightModel,
  heading: number,
  stage: number,
): number {
  const reach = stage === 0 ? ARROW_REACH : ARROW_REACH - 18;
  model.setPointer(
    model.centerX + Math.cos(heading) * reach,
    model.centerY + Math.sin(heading) * reach,
  );
  return stage === 0 ? 1 : 2;
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
  let counterHeading: number | null = null;
  let counterStage = 0;

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
    } else if (policy === "tap") {
      // The least input that used to reset the anti-camp clock: one frame of
      // pull per 0.9 s, never aiming and never landing. It must not be able to
      // park the fight.
      model.setPointer(model.centerX, model.centerY);
      hold = Math.floor(time / 0.9) !== Math.floor((time - dt) / 0.9);
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

      // Rest through the telegraph and through a feint's false lunge: the
      // violet arrow says the heading is a lie, so a skilled player releases
      // early and only grabs the arrow when the true heading is revealed.
      if (model.warn > 0 || (model.isFeint && !model.feintRevealed)) {
        hold = false;
        counterHeading = null;
        counterStage = 0;
      } else if (model.counterOpen > 0) {
        // The counter is a gesture: press on the arrow, drag to the middle.
        if (counterHeading === null) counterHeading = model.counterHeading;
        counterStage = counterFrame(model, counterHeading, counterStage);
        hold = true;
      } else {
        counterHeading = null;
        counterStage = 0;
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
    time,
    maxOutside,
    finalEndurance: model.enduranceValue,
    escapeMeter: model.escapeMeter,
  };
}

function summarize(label: string, runs: RunStats[]): void {
  const wins = runs.filter((run) => run.won).length;
  const time = runs.reduce((sum, run) => sum + run.time, 0) / runs.length;
  const outside =
    runs.reduce((sum, run) => sum + run.maxOutside, 0) / runs.length;
  const endurance =
    runs.reduce((sum, run) => sum + run.finalEndurance, 0) / runs.length;
  const rate = (wins / runs.length) * 100;
  console.log(
    `${label.padEnd(20)} win ${rate.toFixed(1).padStart(5)}%  ` +
      `time ${time.toFixed(1).padStart(4)}s  ` +
      `max ${outside.toFixed(1).padStart(4)}px  ` +
      `endurance ${endurance.toFixed(2)}`,
  );
}

function winRate(runs: RunStats[]): number {
  return runs.filter((run) => run.won).length / runs.length;
}

function checkRoster(): void {
  const problems = validateFishData(hasBehaviorScript, hasStrongDash);
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
  const strong = FISH.filter((fish) => hasStrongDash(fish.behavior)).length;
  console.log(
    `roster OK: ${FISH.length} species, three areas, ` +
      `${strong} telegraphed dashes, windows wrap correctly`,
  );
}

checkRoster();

const RUNS = 150;
/** Policies that get the full 150-run table; `tap` is only a stall probe. */
type FightPolicy = Exclude<Policy, "tap">;
const results: Record<FightPolicy, RunStats[]> = {
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

/** A fight driven by a hold-centre bot, stopped at its first live telegraph. */
function untilTelegraph(fish: FishSpecies, seed: number): FightModel | null {
  Math.random = makeRandom(seed);
  const model = new FightModel(fish, { anchor: { x: 255, y: 150 } });
  model.setPointer(model.centerX, model.centerY);
  let time = 0;
  while (model.isRunning && time < 20) {
    model.setHold(true);
    model.update(1 / 60);
    time += 1 / 60;
    if (model.warn > 0) return model;
  }
  return null;
}

/**
 * A pause freezes the fight, so a telegraph that was live when the player
 * paused must not survive the menu: on resume the dash is spent together with
 * its counter window. A pause outside a dash must change nothing.
 */
function pauseCheck(): void {
  const fish = FISH.find((entry) => entry.id === "walleye") ?? FISH[0];
  let model: FightModel | null = null;
  for (let seed = 1; seed <= 300 && model === null; seed += 1) {
    model = untilTelegraph(fish, seed * 17 + 3);
  }
  if (model === null) throw new Error("no telegraph found for the pause check");
  const meter = model.escapeMeter;
  model.resumeFromPause();
  const spent = model.counterOpen === 0;
  const pending = model.escapePending;
  // The miss is paid in full but pours in over `missFillTime`: one frame must
  // not move the clock, the end of the pour must have banked the whole share.
  model.update(1 / 60);
  const jump = model.escapeMeter - meter;
  let time = 0;
  while (model.isRunning && model.escapePending > 0 && time < 3) {
    model.setHold(true);
    model.update(1 / 60);
    time += 1 / 60;
  }
  const settled = model.escapeMeter;
  const passed =
    model.warn === 0 &&
    !model.hasAdvantage &&
    spent &&
    pending > 0.4 * model.escapeHold &&
    jump < 0.05 &&
    settled > meter + 0.3;
  console.log(
    `pause telegraph     ${passed ? "OK" : "FAIL"}  ` +
      `warn ${model.warn.toFixed(2)}  ` +
      `escape ${meter.toFixed(2)} -> ${settled.toFixed(2)} ` +
      `(frame +${jump.toFixed(3)})`,
  );
  if (!passed) throw new Error("a paused telegraph was not settled on resume");

  Math.random = makeRandom(5);
  const calm = new FightModel(fish, { anchor: { x: 255, y: 150 } });
  const before = calm.escapeMeter;
  calm.resumeFromPause();
  const quiet = calm.escapeMeter === before;
  console.log(`pause calm          ${quiet ? "OK" : "FAIL"}`);
  if (!quiet) throw new Error("a pause outside a dash changed the fight");
}

/**
 * The expensive-miss rule: one unanswered strong dash costs half the escape
 * meter, two in a row tear the fish free even if it is already back inside.
 * The share pours in over `missFillTime` instead of jumping in one frame.
 */
function missCheck(): void {
  const fish = FISH.find((entry) => entry.id === "walleye") ?? FISH[0];
  let model: FightModel | null = null;
  for (let seed = 1; seed <= 300 && model === null; seed += 1) {
    model = untilTelegraph(fish, seed * 13 + 11);
  }
  if (model === null) throw new Error("no telegraph found for the miss check");

  model.resumeFromPause();
  const pending = model.escapePending;
  let time = 0;
  while (model.isRunning && model.escapePending > 0 && time < 3) {
    model.setHold(true);
    model.update(1 / 60);
    time += 1 / 60;
  }
  const one = model.escapeMeter;
  const oneMiss =
    pending > 0.4 * model.escapeHold && one > 0.3 && model.isRunning;

  // Hold through the next beats, never countering, until the next telegraph.
  time = 0;
  while (model.isRunning && time < 20 && model.warn === 0) {
    model.setHold(true);
    model.update(1 / 60);
    time += 1 / 60;
  }
  if (!model.isRunning) throw new Error("the fish left before the second dash");
  model.resumeFromPause();
  // The second miss pours in too, and the clock must still reach the tear-off.
  time = 0;
  while (model.isRunning && time < 4) {
    model.setHold(true);
    model.update(1 / 60);
    time += 1 / 60;
  }
  const twoMisses = !model.isRunning && model.result?.won === false;
  const passed = oneMiss && twoMisses;
  console.log(
    `miss cost           ${passed ? "OK" : "FAIL"}  ` +
      `one ${one.toFixed(2)}  second ${twoMisses ? "tore free" : "survived"}`,
  );
  if (!passed) {
    throw new Error("two missed dashes did not tear the fish free");
  }
}

/**
 * A fresh hook is never a burst: no fish may telegraph or leave the ring during
 * the opening grace, and the dash that was deferred must still arrive right
 * after it.
 */
function openingCheck(): void {
  let warns = 0;
  let bolts = 0;
  FISH.forEach((fish, index) => {
    Math.random = makeRandom(2000 + index * 37);
    const model = new FightModel(fish, { anchor: { x: 255, y: 150 } });
    let time = 0;
    while (model.isRunning && time < FIGHT.startGrace - 0.05) {
      model.setHold(false);
      model.update(1 / 60);
      time += 1 / 60;
      // A dash is a telegraph or a bolt: arcs, waves and zigzags are slower
      // than 120 px/s and are allowed to start the fight.
      if (model.warn > 0) warns += 1;
      const velocity = model.fishVelocity;
      if (Math.hypot(velocity.x, velocity.y) > 120) bolts += 1;
    }
  });

  // The deferral is a delay, not a cancellation.
  const trout = FISH.find((entry) => entry.id === "rainbowtrout");
  let warned = false;
  if (trout) {
    Math.random = makeRandom(77);
    const model = new FightModel(trout, { anchor: { x: 255, y: 150 } });
    let time = 0;
    while (model.isRunning && time < FIGHT.startGrace + 1.5) {
      model.setHold(false);
      model.update(1 / 60);
      time += 1 / 60;
      if (model.warn > 0) warned = true;
    }
  }

  const passed = warns === 0 && bolts === 0 && warned;
  console.log(
    `opening grace       ${passed ? "OK" : "FAIL"}  ` +
      `${warns} warnings  ${bolts} bolts  ` +
      `first dash ${warned ? "delivered" : "missing"}`,
  );
  if (!passed) throw new Error("the fish dashed straight after the hook");
}

/**
 * Aiming against the run is the strongest tiring input, and it used to satisfy
 * the counter's `reversed` branch on its own: counters arrived without the
 * player ever releasing the button or reading a telegraph. Holding and aiming
 * alone must not land a single counter now.
 */
function freeCounterCheck(): void {
  let counters = 0;
  FISH.forEach((fish, fishIndex) => {
    for (let run = 0; run < 5; run += 1) {
      Math.random = makeRandom(9000 + fishIndex * 31 + run * 7);
      const model = new FightModel(fish, { anchor: { x: 255, y: 150 } });
      let time = 0;
      while (model.isRunning && time < 30) {
        const point = model.fishPoint;
        const velocity = model.fishVelocity;
        const speed = Math.hypot(velocity.x, velocity.y);
        if (speed > 12) {
          model.setPointer(
            point.x - (velocity.x / speed) * 60,
            point.y - (velocity.y / speed) * 60,
          );
        } else {
          model.setPointer(model.centerX, model.centerY);
        }
        model.setHold(true);
        const before = model.hasAdvantage;
        model.update(1 / 60);
        if (!before && model.hasAdvantage) counters += 1;
        time += 1 / 60;
      }
    }
  });
  const passed = counters === 0;
  console.log(
    `free counter        ${passed ? "OK" : "FAIL"}  ` +
      `${counters} counters from aim alone`,
  );
  if (!passed) {
    throw new Error("aiming against the run landed a counter without a press");
  }
}

/**
 * The grab may be prepared. A press put down inside the dash wedge while the
 * telegraph is still up has to arm the counter, so the burst itself only needs
 * the pull; a press outside the wedge must arm nothing, or holding the line
 * would counter by accident again.
 */
function preGrabCheck(): void {
  const fish = FISH.find((entry) => entry.id === "walleye") ?? FISH[0];

  /** Does a press `reach` px along the dash heading land a counter? */
  const counters = (seed: number, pressInWedge: boolean): boolean => {
    let model: FightModel | null = null;
    for (let attempt = 1; attempt <= 300 && model === null; attempt += 1) {
      const candidate = untilTelegraph(fish, seed + attempt * 17);
      // A feint hides its true heading under the telegraph, and the prepared
      // press is a wedge test, so the check needs an honest dash.
      if (candidate !== null && !candidate.isFeint) model = candidate;
    }
    if (model === null) {
      throw new Error("no honest telegraph for the pre-grab check");
    }

    const fight = model;
    const heading = fight.warnHeading;
    const place = (reach: number): void => {
      fight.setPointer(
        fight.centerX + Math.cos(heading) * reach,
        fight.centerY + Math.sin(heading) * reach,
      );
    };

    // The fight was driven with the button down at the centre; a press in the
    // wedge is a new edge, and that edge is what the model records.
    fight.setHold(false);
    place(pressInWedge ? ARROW_REACH : 0);
    fight.setHold(true);

    let time = 0;
    while (fight.isRunning && fight.warn > 0 && time < 5) {
      fight.setHold(true);
      fight.update(1 / 60);
      time += 1 / 60;
    }
    // The burst is live: pull to the middle, which is the rest of the gesture.
    place(ARROW_REACH - 18);
    let guard = 0;
    while (fight.isRunning && guard < 30 && !fight.hasAdvantage) {
      fight.setHold(true);
      fight.update(1 / 60);
      guard += 1;
    }
    return fight.hasAdvantage;
  };

  const prepared = counters(3100, true);
  const fromCentre = counters(3100, false);
  const passed = prepared && !fromCentre;
  console.log(
    `prepared grab       ${passed ? "OK" : "FAIL"}  ` +
      `wedge ${prepared ? "counters" : "misses"}  ` +
      `centre ${fromCentre ? "counters" : "misses"}`,
  );
  if (!passed) {
    throw new Error("a press before the window did not arm the counter");
  }
}

/**
 * One frame of pull per 0.9 s used to keep the neglect clock at zero, so a
 * fight could be parked forever. The drift must win now: the fish leaves the
 * ring and the fight ends on its own.
 */
function tapCheck(): void {
  const runs: RunStats[] = [];
  FISH.forEach((fish, fishIndex) => {
    for (let run = 0; run < 5; run += 1) {
      runs.push(simulate(fish, "tap", 7000 + fishIndex * 29 + run * 11));
    }
  });
  const wins = runs.filter((run) => run.won).length;
  const open = runs.filter((run) => run.time >= 60).length;
  const passed = wins === 0 && open === 0;
  console.log(
    `tap stall           ${passed ? "OK" : "FAIL"}  ` +
      `${wins} wins, ${open} still open at 60 s`,
  );
  if (!passed) throw new Error("a tapping bot can stall the fight");
}

/**
 * The fight must live on the simulation clock, not on the frame rate: at 60,
 * 30 and 10 fps the same wall-clock second has to advance the same fight time,
 * and one very long frame is capped instead of jumping a telegraph.
 */
function dtCheck(): void {
  Math.random = makeRandom(4242);
  const model = new FightModel(FISH[0], { anchor: { x: 255, y: 150 } });
  for (let i = 0; i < 9; i += 1) model.update(1 / 30);
  const at30 = model.time;
  model.update(0.5);
  const afterStall = model.time;
  model.update(1 / 120);
  const afterHalf = model.time;
  model.update(1 / 120);
  const afterWhole = model.time;
  const passed =
    Math.abs(at30 - 0.3) < 1e-6 &&
    Math.abs(afterStall - 0.4) < 1e-6 &&
    Math.abs(afterHalf - 0.4) < 1e-6 &&
    Math.abs(afterWhole - 0.4 - 1 / 60) < 1e-6;
  console.log(
    `fixed step          ${passed ? "OK" : "FAIL"}  ` +
      `0.3 -> ${at30.toFixed(3)}  stall -> ${afterStall.toFixed(3)}  ` +
      `half -> ${afterHalf.toFixed(3)}  whole -> ${afterWhole.toFixed(3)}`,
  );
  if (!passed) throw new Error("the fight clock does not follow real time");
}

pauseCheck();
missCheck();
openingCheck();
freeCounterCheck();
preGrabCheck();
tapCheck();
dtCheck();

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
if (holdRate < 0.05) {
  throw new Error(
    `hold-centre bot is too weak: ${(holdRate * 100).toFixed(1)}% wins`,
  );
}
if (holdRate > 0.25) {
  throw new Error(
    `hold-centre bot is too strong: ${(holdRate * 100).toFixed(1)}% wins`,
  );
}
/**
 * The careful-but-unreading bot. Its band moved when the counter became a
 * gesture: aiming against a dash while holding the line used to land one by
 * accident, and a bot that never grabs the arrow now has one tool fewer. The
 * band still proves the fight is winnable without reading telegraphs, and that
 * it is not winnable by simply holding the button.
 */
const PULSE_BAND = { min: 0.28, max: 0.55 } as const;

if (pulseRate < PULSE_BAND.min || pulseRate > PULSE_BAND.max) {
  throw new Error(
    `pulse-centre bot outside ${PULSE_BAND.min * 100}-${PULSE_BAND.max * 100}%: ` +
      `${(pulseRate * 100).toFixed(1)}% wins`,
  );
}
if (skilledRate < 0.9) {
  throw new Error(
    `skilled bot is too weak: ${(skilledRate * 100).toFixed(1)}% wins`,
  );
}
if (skilledRate - pulseRate < 0.3) {
  throw new Error(
    `counter play is not decisive: skilled ${(skilledRate * 100).toFixed(1)}% ` +
      `vs pulse ${(pulseRate * 100).toFixed(1)}%`,
  );
}
if (weakSkilled.length > 0) {
  throw new Error(`skilled bot under 70% for: ${weakSkilled.join(", ")}`);
}
console.log("balance OK: misses cost, counters decide, holding does not win");
