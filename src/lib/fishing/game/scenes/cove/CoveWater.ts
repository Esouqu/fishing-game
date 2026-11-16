import { Graphics } from "pixi.js";
import { VIEW } from "../../../config";
import { CoveBase } from "./CoveBase";
import { SHORE_X, noise } from "./geometry";

export class CoveWater extends CoveBase {
  protected drawChop(g: Graphics): void {
    let row = 0;
    for (let y = 7; y < VIEW.height - 3; y += 5 + noise(row, 1) * 4, row += 1) {
      // Each row starts at its own offset and steps at its own pace: a fixed
      // grid turned the surface into a visible lattice of dashes.
      for (
        let x = SHORE_X + 2 + noise(row, 13) * 9;
        x < VIEW.width - 2;
        x += 7 + noise(row * 7 + Math.round(x), 15) * 7
      ) {
        const seed = noise(row * 31 + Math.round(x), 7);
        if (seed < 0.2) continue;
        const px = x + (noise(row * 17 + Math.round(x), 3) - 0.5) * 9;
        const py = y + (noise(row * 13 + Math.round(x), 5) - 0.5) * 5;
        if (!this.isWater(px, py)) continue;

        const length = 2.5 + seed * 7;
        const bend = (noise(Math.round(row + x), 9) - 0.5) * 2;
        const depth = (px - SHORE_X) / (VIEW.width - SHORE_X);
        const tone =
          noise(row * 7 + Math.round(x), 11) > 0.4
            ? this.palette.snowLight
            : this.palette.ice;
        // Near the bank the crests are crisp; by the horizon they flatten out.
        const alpha = (0.07 + seed * 0.14) * (1 - depth * 0.4);
        g.moveTo(px, py);
        g.quadraticCurveTo(
          px + length * 0.5,
          py + bend,
          px + length,
          py + bend * 0.4,
        );
        g.stroke({ width: 1, color: tone, alpha });
        // The shade under a crest is what makes it stand up.
        if (seed > 0.68) {
          g.moveTo(px + 1, py + 1);
          g.lineTo(px + length * 0.7, py + 1 + bend * 0.3);
          g.stroke({
            width: 1,
            color: this.palette.waterFar,
            alpha: alpha * 0.45,
          });
        }
        // Every so often the crest breaks into a speck of foam.
        if (seed > 0.9) {
          g.rect(px + length * 0.6, py - 1, 1, 1).fill({
            color: this.palette.snowLight,
            alpha: 0.5,
          });
        }
      }
    }
  }

  /** A handful of breaking crests: a bright lip over a darker trough. */
  protected drawCrests(g: Graphics): void {
    for (let i = 0; i < 30; i += 1) {
      const x = SHORE_X + 16 + noise(i, 41) * (VIEW.width - SHORE_X - 28);
      const y = 12 + noise(i, 42) * (VIEW.height - 26);
      if (!this.isWater(x, y)) continue;
      const width = 5 + noise(i, 43) * 10;
      const lip = 1.2 + noise(i, 44) * 1.4;
      g.moveTo(x, y);
      g.quadraticCurveTo(x + width * 0.5, y - lip, x + width, y + 0.4);
      g.stroke({
        width: 1,
        color: this.palette.snowLight,
        alpha: 0.16 + noise(i, 45) * 0.16,
      });
      g.moveTo(x + 1, y + 1);
      g.quadraticCurveTo(
        x + width * 0.5,
        y + 1.6 - lip * 0.4,
        x + width * 0.9,
        y + 1.2,
      );
      g.stroke({
        width: 1,
        color: this.palette.waterFar,
        alpha: 0.12 + noise(i, 46) * 0.1,
      });
    }
  }

  /** Static glints: single bright pixels, the brightest of them twinkle. */
  protected drawSparkles(g: Graphics): void {
    for (let i = 0; i < 210; i += 1) {
      const x = SHORE_X + 2 + noise(i, 51) * (VIEW.width - SHORE_X - 4);
      const y = 5 + noise(i, 52) * (VIEW.height - 10);
      if (!this.isWater(x, y)) continue;
      const bright = noise(i, 53);
      g.rect(x, y, 1, 1).fill({
        color: this.palette.snowLight,
        alpha: 0.16 + bright * 0.4,
      });
      if (bright > 0.86) {
        g.rect(x, y + 1, 2, 1).fill({
          color: this.palette.snowLight,
          alpha: 0.3,
        });
      }
    }
  }

  /**
   * Foam where the swell meets the snowy bank: a broken line two pixels off
   * the shore, thicker and brighter at the little points of the bank.
   */
  protected drawFoam(g: Graphics): void {
    for (let y = 0; y < VIEW.height; y += 3) {
      const edge = this.shoreEdgeAt(y) + 3;
      const seed = noise(y, 61);
      if (seed < 0.42) continue;
      g.rect(edge, y, 1 + Math.round(seed * 3), 1).fill({
        color: this.palette.snowLight,
        alpha: 0.18 + seed * 0.32,
      });
      if (seed > 0.8) {
        g.rect(edge + 4, y + 1, 2, 1).fill({
          color: this.palette.ice,
          alpha: 0.35,
        });
      }
    }
  }

  protected drawWaterRipples(g: Graphics): void {
    for (const ripple of this.ripples) {
      g.moveTo(ripple.x, ripple.y);
      g.quadraticCurveTo(
        ripple.x + ripple.length * 0.5,
        ripple.y + ripple.bend,
        ripple.x + ripple.length,
        ripple.y + ripple.slope,
      );
      g.stroke({
        width: ripple.width,
        color: ripple.color,
        alpha: ripple.alpha,
      });
      if (ripple.length > 14 && ripple.alpha > 0.065) {
        g.rect(
          ripple.x + ripple.length - 1,
          ripple.y + ripple.slope - 1,
          1,
          1,
        ).fill({
          color: this.palette.snowLight,
          alpha: Math.min(0.9, ripple.alpha * 1.3),
        });
      }
    }
  }

  protected drawIce(
    g: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    g.ellipse(x, y, width, height).fill({
      color: this.palette.iceDeep,
      alpha: 0.3,
    });
    g.ellipse(x, y - 0.8, width * 0.92, height * 0.72).fill({
      color: this.palette.ice,
      alpha: 0.6,
    });
    g.ellipse(x - width * 0.16, y - 1.2, width * 0.42, height * 0.36).fill({
      color: this.palette.snowLight,
      alpha: 0.7,
    });
    g.rect(x - width * 0.35, y + height * 0.15, width * 0.7, 1).fill({
      color: this.palette.iceDeep,
      alpha: 0.45,
    });
  }
}
