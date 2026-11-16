import type { FishSpecies } from "../../fish";
import type { Temperament } from "../../types";
import type { Move } from "../behaviors";
import type { Bubble, MinigameResult, WeightLoad } from "./types";

/**
 * Mutable state of one ring fight. The model and its three helpers
 * (`FightMotion`, `FightStamina`, `FightCounter`) share this object instead of
 * reaching into each other: the model owns the tick order, the helpers own
 * their own rules.
 */
export interface FightState {
  readonly fish: FishSpecies;
  readonly centerX: number;
  readonly centerY: number;
  readonly load: WeightLoad;
  readonly temperament: Temperament;
  readonly tempo: number;
  readonly runPower: number;
  readonly tirePower: number;
  readonly recoveryPower: number;
  readonly feintChance: number;
  readonly escapeHold: number;
  readonly recoveryRate: number;

  fishX: number;
  fishY: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;

  script: Move[];
  moveIndex: number;
  current: Move | null;
  moveTime: number;
  moveStartAngle: number;
  moveStartRadius: number;
  escapeAngle: number;
  lastAngle: number;
  warnTime: number;
  warnAngle: number;
  warnRest: number;
  /** A strong dash that first lunges toward a false warning. */
  feintActive: boolean;
  feintTimer: number;
  feintAngle: number;
  feintHasRevealed: boolean;
  turnFlashValue: number;

  endurance: number;
  grip: number;
  gripLock: number;
  advantage: number;
  counterWindow: number;
  counterAngle: number;
  counterArmed: boolean;
  counterUsed: boolean;
  counterPending: boolean;
  counterFlash: number;
  stun: number;
  preBurstAngle: number | null;
  lastSteerAngle: number | null;
  ready: boolean;
  lastReadyChime: number;

  sameAimTime: number;
  lastAimAngle: number | null;
  feintPending: boolean;
  lastRunPending: boolean;
  lastRunUsed: boolean;
  lastRunRolled: boolean;

  hold: boolean;
  finalCooldown: number;

  pointerX: number | null;
  pointerY: number | null;
  directionX: number;
  directionY: number;
  steeringNow: boolean;
  /** Last meaningful cursor direction, kept while the cursor covers the fish. */
  stickyX: number;
  stickyY: number;

  bubbles: Bubble[];
  bubbleTimer: number;

  running: boolean;
  perfect: boolean;
  slips: number;
  outside: boolean;
  outsideTimer: number;
  slipCooldown: number;
  elapsed: number;
  finishResult: MinigameResult | null;

  onFinish?: (result: MinigameResult) => void;
  onWarn?: () => void;
  onCounter?: () => void;
  onReady?: () => void;
  onResist?: () => void;
  onGripOut?: () => void;
}
