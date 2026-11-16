import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import type { FishSpecies } from "../../config";
import { TEXT } from "../../texts";
import { FIGHT_RADIUS } from "../fight";
import { UI } from "../../ui/palette";
import { makeText } from "../../ui/theme";
import {
  FightModel,
  type MinigameOptions,
  type MinigameResult,
} from "../fight";
import { FISH_SCALE, SILHOUETTE } from "./setup";

export abstract class MinigameCore extends Container {
  protected readonly model: FightModel;
  protected readonly fishSprite: Sprite;
  protected readonly ringG = new Graphics();
  protected readonly counterG = new Graphics();
  protected readonly directionG = new Graphics();
  protected readonly cueG = new Graphics();
  protected readonly barG = new Graphics();
  protected readonly gripG = new Graphics();
  protected readonly warnG = new Graphics();
  protected readonly counterLabel: Text;
  /**
   * The landing-window mark: the same "!" the bite raises over the float.
   *
   * The landing cue used to be a closing ring around the fish. In a fight that
   * already draws a ring, two stamina bars and a heading arrow, one more circle
   * was the least legible way to say "act now" — and it arrived as a pulse
   * rather than as a point. The exclamation is the one symbol the round already
   * teaches the player (it is the bite), so the landing window reuses it.
   */
  protected readonly landMark: Text;
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
  /** 0..1 progress of the closing landing ring; 0 while it is not landable. */
  protected landCue = 0;
  /** 0..1 opacity of the landing cue, so it can fade in and out on its own. */
  protected landFade = 0;
  protected wasLandable = false;

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

    // Mint, not the bite's gold: the bite means "a fish is on", this one means
    // "it is spent, take it", and the mint is already the colour of the fish's
    // stamina running out on the bar above.
    this.landMark = makeText(TEXT.game.biteMark, {
      size: 22,
      color: UI.mint,
      weight: 800,
      align: "center",
    });
    this.landMark.anchor.set(0.5, 1);
    this.landMark.style.stroke = { color: UI.ink, width: 3 };
    this.landMark.visible = false;
    this.addChild(this.landMark);

    this.bars.addChild(this.barG);
    this.bars.addChild(this.gripG);
    this.bars.eventMode = "none";
    this.addChild(this.directionG);
    this.addChild(this.cueG);
    this.addChild(this.warnG);
    this.model.onFinish = (result) => this.onFinish?.(result);
    this.update(0);
  }

  get isSteering(): boolean {
    return this.model.isSteering;
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
  protected abstract updateLandCue(dt: number): void;
  protected abstract syncFishVisual(): void;
  protected abstract updateLandMark(): void;
}
