import { Container, Graphics, Rectangle, Text } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import type { AudioKit } from "../audio";
import {
  MIX_CHANNELS,
  MIX_GROUPS,
  formatGain,
  type AudioMix,
  type MixChannel,
  type MixChannelDef,
  type MixGroup,
} from "../audioMix";
import { VIEW } from "../config";
import { CURSORS } from "../cursors";
import { TEXT } from "../texts";
import { clamp } from "../utils";
import { Button } from "./Button";
import { UI } from "./palette";
import { drawPanel, drawPlayIcon, makeText, setText } from "./theme";

/** Colour of a fader's filled part, per group: the panel reads as one board. */
const GROUP_COLOR: Record<MixGroup, number> = {
  interface: UI.periwinklePale,
  fishing: UI.ice,
  fight: UI.amber,
  world: UI.legendary,
  ambience: UI.teal,
};

/** Panel geometry, all in the 480×270 virtual frame. */
const PANEL = { x: 16, y: 6, width: 448, height: 258 };
const COLUMN = { width: 176, gap: 22 };
const ROW = {
  height: 10,
  /** Width of the audition button sitting left of the name. */
  play: 10,
  gap: 3,
  name: 47,
  track: 88,
  /** Readout column right of the fader. */
  value: 24,
};
/** x of the fader start, the name start and the readout's right edge. */
const NAME_X = ROW.play + ROW.gap;
const TRACK_X = NAME_X + ROW.name;
const ROW_END = TRACK_X + ROW.track + ROW.value;
const HEADER = 12;
const LIST_TOP = 38;

export interface AudioMixPanelDeps {
  audio: AudioKit;
  /** Keeps a tuning session across reloads. */
  onPersist(mix: AudioMix): void;
  /** Writes the mix into `audioMix.ts` (dev server) or downloads it. */
  onSave(mix: AudioMix): Promise<string>;
  onCopy(mix: AudioMix): Promise<string>;
  isMuted(): boolean;
  onToggleMute(): void;
  onClose(): void;
}

/** One fader: name, track, gain readout. */
class MixRow extends Container {
  private readonly def: MixChannelDef;
  private readonly trackWidth = ROW.track;
  private readonly track = new Graphics();
  private readonly valueText: Text;
  private readonly onChange: (channel: MixChannel, value: number) => void;
  private readonly onPreview: (channel: MixChannel) => void;
  private dragging = false;
  private value = 0;

  constructor(
    def: MixChannelDef,
    onChange: (channel: MixChannel, value: number) => void,
    onPreview: (channel: MixChannel) => void,
  ) {
    super();
    this.def = def;
    this.onChange = onChange;
    this.onPreview = onPreview;

    // Audition button first: a fader has to be audible on its own without
    // waiting for the game to trigger it, and a control the panel draws is
    // easier to find than a name that happens to be clickable.
    const play = new Button({
      width: ROW.play,
      height: ROW.height,
      variant: "ghost",
      icon: (g) => drawPlayIcon(g, UI.text),
      onClick: () => this.onPreview(this.def.id),
      // Silent: the cue being auditioned is the sound, not the press.
      quiet: true,
    });
    play.position.set(0, 0);
    this.addChild(play);

    const label = makeText(def.label, {
      size: 6,
      weight: 700,
      color: UI.text,
    });
    label.anchor.set(0, 0.5);
    label.position.set(NAME_X, ROW.height / 2);
    this.addChild(label);

    // The name stays a shortcut for the same preview, so a click anywhere on
    // the row's label plays the cue that button does.
    label.eventMode = "static";
    label.cursor = CURSORS.pointer;
    label.hitArea = new Rectangle(0, 0, ROW.name, ROW.height);
    label.on("pointertap", () => this.onPreview(this.def.id));

    this.track.position.set(TRACK_X, ROW.height / 2);
    this.track.eventMode = "static";
    this.track.cursor = CURSORS.pointer;
    this.track.hitArea = new Rectangle(-4, -7, this.trackWidth + 8, 14);
    this.track.on("pointerdown", (event: FederatedPointerEvent) => {
      this.dragging = true;
      this.track.on("globalpointermove", this.onDrag);
      this.setFromPointer(event);
    });
    this.track.on("pointerup", () => this.endDrag());
    this.track.on("pointerupoutside", () => this.endDrag());
    this.addChild(this.track);

    this.valueText = makeText("0.00", {
      size: 6,
      weight: 700,
      color: UI.textMuted,
      align: "right",
    });
    this.valueText.anchor.set(1, 0.5);
    this.valueText.position.set(ROW_END, ROW.height / 2);
    this.addChild(this.valueText);

    this.setValue(0);
  }

  /** Gain shown by this fader. */
  setValue(value: number): void {
    this.value = clamp(value);
    setText(this.valueText, formatGain(this.value));
    this.drawTrack();
  }

  private onDrag = (event: FederatedPointerEvent): void => {
    this.setFromPointer(event);
  };

  private endDrag(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.track.off("globalpointermove", this.onDrag);
  }

  private setFromPointer(event: FederatedPointerEvent): void {
    const local = event.getLocalPosition(this);
    const value = clamp((local.x - TRACK_X) / this.trackWidth);
    if (value === this.value) return;
    this.setValue(value);
    this.onChange(this.def.id, value);
  }

  private drawTrack(): void {
    const g = this.track;
    const width = this.trackWidth;
    const filled = Math.max(0, Math.round(width * this.value));
    const color = GROUP_COLOR[this.def.group];
    g.clear();
    g.rect(0, -3, width, 6).fill({ color: UI.ink, alpha: 0.75 });
    g.rect(0, -2, width, 4).fill({ color: UI.panelAlt, alpha: 0.9 });
    if (filled > 0) {
      g.rect(0, -2, filled, 4).fill(color);
      g.rect(0, -2, filled, 1).fill({ color: UI.text, alpha: 0.45 });
    }
    g.rect(0, -3, width, 6).stroke({
      width: 1,
      color: UI.periwinkle,
      alpha: 0.55,
    });
    if (Math.abs(this.value - 1) < 0.001) {
      // Fully open: a bright rim marks the end of the travel.
      g.rect(width - 1, -3, 1, 6).fill(UI.primary);
    }
    g.rect(filled - 1, -5, 3, 10).fill(UI.ink);
    g.rect(filled, -4, 1, 8).fill(UI.text);
  }
}

/**
 * Dev panel for the audio balance (F2).
 *
 * Every cue in the game is one fader here. Dragging writes through to the live
 * `AudioKit`, so the mix is heard while it is being built; the panel can then
 * push the result back into the code (`audioMix.ts`) through the dev server, or
 * hand the generated source to the clipboard / a download when the game runs
 * from a production build.
 */
export class AudioMixPanel extends Container {
  private readonly deps: AudioMixPanelDeps;
  private readonly rows = new Map<MixChannel, MixRow>();
  private readonly statusText: Text;
  private readonly muteButton: Button;
  private readonly blocker: Graphics;
  private open_ = false;
  private saveButton: Button | null = null;

  constructor(deps: AudioMixPanelDeps) {
    super();
    this.deps = deps;
    this.visible = false;

    this.blocker = new Graphics();
    this.blocker
      .rect(0, 0, VIEW.width, VIEW.height)
      .fill({ color: UI.scrim, alpha: 0.7 });
    this.blocker.eventMode = "static";
    this.blocker.cursor = CURSORS.default;
    this.blocker.hitArea = new Rectangle(0, 0, VIEW.width, VIEW.height);
    this.addChild(this.blocker);

    const panel = new Graphics();
    drawPanel(panel, PANEL.x, PANEL.y, PANEL.width, PANEL.height, {
      fill: UI.panel,
      alpha: 0.99,
      shadow: true,
    });
    this.addChild(panel);

    const title = makeText("ЗВУК: БАЛАНС", {
      size: 11,
      weight: 800,
      color: UI.text,
      letterSpacing: 1,
    });
    title.position.set(PANEL.x + 14, PANEL.y + 9);
    this.addChild(title);

    const hint = makeText(TEXT.devtools.hint, {
      size: 6,
      color: UI.textMuted,
    });
    hint.position.set(PANEL.x + 14, PANEL.y + 23);
    this.addChild(hint);

    this.buildRows();
    this.statusText = makeText("", {
      size: 6,
      color: UI.textMuted,
      align: "center",
      wordWrapWidth: PANEL.width - 40,
    });
    this.statusText.anchor.set(0.5, 0);
    this.statusText.position.set(
      PANEL.x + PANEL.width / 2,
      PANEL.y + PANEL.height - 17,
    );
    this.addChild(this.statusText);

    const buttonY = PANEL.y + PANEL.height - 40;
    const buttonWidth = 76;
    const gap = 8;
    const total = buttonWidth * 5 + gap * 4;
    const startX = PANEL.x + (PANEL.width - total) / 2;
    const at = (index: number): number => startX + index * (buttonWidth + gap);

    const reset = new Button({
      label: TEXT.devtools.reset,
      width: buttonWidth,
      height: 18,
      size: 8,
      onClick: () => this.reset(),
    });
    reset.position.set(at(0), buttonY);
    this.addChild(reset);

    const copy = new Button({
      label: TEXT.devtools.copy,
      width: buttonWidth,
      height: 18,
      size: 8,
      onClick: () => void this.copy(),
    });
    copy.position.set(at(1), buttonY);
    this.addChild(copy);

    this.saveButton = new Button({
      label: TEXT.devtools.save,
      width: buttonWidth,
      height: 18,
      size: 8,
      variant: "primary",
      onClick: () => void this.save(),
    });
    this.saveButton.position.set(at(2), buttonY);
    this.addChild(this.saveButton);

    this.muteButton = new Button({
      label: TEXT.devtools.sound,
      width: buttonWidth,
      height: 18,
      size: 8,
      onClick: () => {
        this.deps.onToggleMute();
        this.refreshMute();
      },
    });
    this.muteButton.position.set(at(3), buttonY);
    this.addChild(this.muteButton);

    const close = new Button({
      label: TEXT.devtools.close,
      width: buttonWidth,
      height: 18,
      size: 8,
      onClick: () => this.deps.onClose(),
    });
    close.position.set(at(4), buttonY);
    this.addChild(close);
  }

  get isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    this.open_ = true;
    this.visible = true;
    this.setMix(this.deps.audio.mixValues);
    this.refreshMute();
    this.setStatus("");
  }

  close(): void {
    this.open_ = false;
    this.visible = false;
  }

  /** Pulls every fader from the live mix. */
  setMix(mix: AudioMix): void {
    for (const [channel, row] of this.rows) row.setValue(mix[channel]);
  }

  /** F2 / Escape; returns true when the panel consumed the key. */
  handleKey(event: KeyboardEvent): boolean {
    if (!this.open_) return false;
    if (event.code === "Escape" || event.code === "F2") {
      this.deps.onClose();
      return true;
    }
    return false;
  }

  private buildRows(): void {
    const left = PANEL.x + 14;
    const right = left + COLUMN.width + COLUMN.gap;
    let y = LIST_TOP;
    let column = 0;
    let group: MixGroup | null = null;
    let firstHeader = true;

    for (const channel of MIX_CHANNELS) {
      if (channel.group !== group) {
        group = channel.group;
        if (column === 0 && y > LIST_TOP + 60) {
          // The left column ran out; continue at the top of the right one.
          column = 1;
          y = LIST_TOP;
          firstHeader = true;
        } else if (!firstHeader) {
          // A little air between groups, so a title never crowds the row above.
          y += 3;
        }
        firstHeader = false;
        const label = MIX_GROUPS.find((item) => item.id === group)?.label ?? "";
        const header = makeText(label, {
          size: 6,
          weight: 800,
          color: UI.periwinkleLight,
          letterSpacing: 1,
        });
        header.position.set(column === 0 ? left : right, y);
        this.addChild(header);
        y += HEADER;
      }

      const row = new MixRow(
        channel,
        (id, value) => this.handleChange(id, value),
        (id) => this.deps.audio.preview(id),
      );
      row.position.set(column === 0 ? left : right, y);
      this.addChild(row);
      this.rows.set(channel.id, row);
      y += ROW.height;
    }
  }

  private handleChange(channel: MixChannel, value: number): void {
    this.deps.audio.setChannel(channel, value);
    this.deps.onPersist(this.deps.audio.mixValues);
    this.setStatus("");
  }

  private reset(): void {
    const mix = this.deps.audio.defaultMix;
    this.deps.audio.setMix(mix);
    this.setMix(mix);
    this.deps.onPersist(mix);
    this.setStatus(TEXT.devtools.resetDone);
  }

  private async copy(): Promise<void> {
    this.setStatus(TEXT.devtools.working);
    this.setStatus(await this.deps.onCopy(this.deps.audio.mixValues));
  }

  private async save(): Promise<void> {
    this.setStatus(TEXT.devtools.working);
    this.setStatus(await this.deps.onSave(this.deps.audio.mixValues));
  }

  private refreshMute(): void {
    const muted = this.deps.isMuted();
    this.muteButton.setLabel(
      muted ? TEXT.devtools.soundOff : TEXT.devtools.soundOn,
    );
  }

  private setStatus(message: string): void {
    setText(this.statusText, message);
    this.statusText.style.fill =
      message === TEXT.devtools.working ? UI.textMuted : UI.text;
  }
}
