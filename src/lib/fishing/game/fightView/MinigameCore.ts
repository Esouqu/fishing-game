import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import type { FishSpecies } from "../../config";
import { TEXT } from "../../texts";
import { FIGHT_RADIUS } from "../fight";
import { UI } from "../../ui/palette";
import { makeKeycap, makeText } from "../../ui/theme";
import {
  FightModel,
  type MinigameOptions,
  type MinigameResult,
} from "../fight";
import { FISH_SCALE, SILHOUETTE } from "./setup";

/** Height of the "ПКМ" chip shown over a landable fish. */
const LAND_KEY_HEIGHT = 9;

export abstract class MinigameCore extends Container {
  protected readonly model: FightModel;
  protected readonly fishSprite: Sprite;
  protected readonly ringG = new Graphics();
  protected readonly counterG = new Graphics();
  /**
   * Direction cues — the small velocity arrow and the dash telegraph.
   *
   * They live in a container of their own so the float layer can put them above
   * the float: the fish-stamina arc is drawn on the float, and a pointer that
   * slides under that gauge disappeared exactly when the fish was closest to it.
   */
  readonly pointers = new Container();
  /** The open landing window: a "ПКМ" keycap over the fish. */
  protected readonly landKey: Container;
  protected readonly directionG = new Graphics();
  protected readonly cueG = new Graphics();
  protected readonly barG = new Graphics();
  protected readonly warnG = new Graphics();
  protected readonly counterLabel: Text;
  /** Caption over the player's stamina bar. */
  protected readonly staminaLabel: Text;
  /**
   * The stamina stack, in a container of its own.
   *
   * It is deliberately **not** a child of the minigame: the fight layer sits
   * under the weather, so bars parented here were dimmed by the fog. The screen
   * parents this container above the fog instead; the drawing code still lives
   * here, and the bars are drawn in scene coordinates, so nothing else changes.
   */
  readonly bars = new Container();
  protected intro = 0;
  protected introScale = 0;

  onFinish?: (result: MinigameResult) => void;

  constructor(fish: FishSpecies, icon: Texture, options: MinigameOptions) {
    super();
    this.model = new FightModel(fish, options);
    this.eventMode = "none";

    this.addChild(this.ringG);

    this.fishSprite = new Sprite(icon);
    this.fishSprite.anchor.set(0.5);
    this.fishSprite.scale.set(FISH_SCALE);
    this.fishSprite.alpha = 0;
    this.fishSprite.tint = SILHOUETTE;
    this.addChild(this.fishSprite);
    this.addChild(this.counterG);

    this.counterLabel = makeText(TEXT.fight.counter, {
      size: 8,
      color: UI.ice,
      weight: 800,
      align: "center",
    });
    this.counterLabel.anchor.set(0.5, 1);
    this.counterLabel.style.stroke = { color: UI.ink, width: 2 };
    this.counterLabel.visible = false;
    this.addChild(this.counterLabel);

    this.bars.addChild(this.barG);
    this.staminaLabel = makeText(TEXT.fight.stamina, {
      size: 5,
      color: UI.textMuted,
      weight: 700,
      align: "center",
    });
    this.staminaLabel.anchor.set(0.5, 1);
    this.staminaLabel.style.stroke = { color: UI.ink, width: 2 };
    this.bars.addChild(this.staminaLabel);
    this.bars.eventMode = "none";

    // The landing cue: a "ПКМ" keycap over the fish while the final pull is
    // live. It lives with the pointers so it sits above the float's stamina arc.
    this.landKey = makeKeycap(TEXT.game.landKey, LAND_KEY_HEIGHT, 5.5, true);
    this.landKey.eventMode = "none";
    this.landKey.visible = false;

    this.pointers.addChild(this.directionG);
    this.pointers.addChild(this.warnG);
    this.pointers.addChild(this.landKey);
    this.pointers.eventMode = "none";
    this.addChild(this.cueG);
    this.model.onFinish = (result) => this.onFinish?.(result);
    this.update(0);
  }

  get isSteering(): boolean {
    return this.model.isSteering;
  }

  /** False once the fight has been decided, whatever the pointer is doing. */
  get isRunning(): boolean {
    return this.model.isRunning;
  }

  /** Screen position of the fish silhouette, used by the trailing float. */
  get fishPoint(): { x: number; y: number } {
    return this.model.fishPoint;
  }

  /** Current fish velocity, used to trail the float behind the fish. */
  get fishVelocity(): { x: number; y: number } {
    return this.model.fishVelocity;
  }

  /** Anchor of the wavy ring, mostly for debugging and screenshots. */
  get ringCenter(): { x: number; y: number } {
    return { x: this.model.centerX, y: this.model.centerY };
  }

  /** True when the fish is tired and inside the circle. */
  get canLand(): boolean {
    return this.model.canLand;
  }

  /** 0..1 escape pressure; shown by the sinking float and taut line. */
  get escapeMeter(): number {
    return this.model.escapeMeter;
  }

  /** 0..1 fish endurance; shown by the half-ring under the float. */
  get endurance(): number {
    return this.model.enduranceValue;
  }

  /** Top of the two-row stamina stack, just above the ring. */
  protected get staminaY(): number {
    return this.model.centerY - FIGHT_RADIUS - 26;
  }

  /** Screen position of the tired fish, used as the touch landing target. */
  get landingTarget(): { x: number; y: number } | null {
    if (!this.canLand) return null;
    const point = this.model.fishPoint;
    return { x: point.x, y: point.y };
  }

  /** Hold to pull; release to rest. */
  setHold(held: boolean): void {
    this.model.setHold(held);
  }

  /** Separate final pull: RMB/F, or a tap on the fish. */
  finalPull(): void {
    this.model.finalPull();
  }

  /** Cursor position in screen space; while held it sets the pull direction. */
  setPointer(x: number | null, y: number | null): void {
    this.model.setPointer(x, y);
  }

  /** Optional keyboard steering direction (normalized by the caller). */
  setDirection(x: number, y: number): void {
    this.model.setDirection(x, y);
  }

  public abstract update(dt: number): void;
  protected abstract draw(): void;
  protected abstract syncFishVisual(): void;
}
