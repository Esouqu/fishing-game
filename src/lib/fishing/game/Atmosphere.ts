import { Container, Graphics } from "pixi.js";
import { C, VIEW } from "../config";
import type { WeatherDef, WorldPalette } from "../world";
import { WEATHER } from "../world";
import { randRange } from "../utils";

interface Drop {
  x: number;
  y: number;
  length: number;
  speed: number;
}

interface Star {
  x: number;
  y: number;
  phase: number;
  speed: number;
  size: number;
}

interface Firefly {
  x: number;
  y: number;
  phase: number;
  speed: number;
  radius: number;
}

interface Splash {
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

const DAY: WorldPalette = {
  tint: 0xffffff,
  overlay: 0xffffff,
  overlayAlpha: 0,
  stars: 0,
  lantern: 0,
  water: C.ocean,
  deep: C.deep,
};

const STAR_COUNT = 44;
const DROP_COUNT = 150;
const FIREFLY_COUNT = 14;

/**
 * Weather and time-of-day dressing for the lake. It never adds HUD text:
 * light, rain, fog, fireflies and lightning tell the player what the world is
 * doing. Intended to sit directly above the scene and below the HUD.
 */
export class Atmosphere extends Container {
  private readonly wash = new Graphics();
  private readonly sky = new Graphics();
  private readonly glow = new Graphics();
  private readonly fogG = new Graphics();
  private readonly rainG = new Graphics();
  private readonly boltG = new Graphics();
  private readonly flashG = new Graphics();

  private readonly drops: Drop[] = [];
  private readonly stars: Star[] = [];
  private readonly fireflies: Firefly[] = [];
  private splashes: Splash[] = [];

  private world: WorldPalette = DAY;
  private weather: WeatherDef = WEATHER.clear;
  private time = 0;

  private boltTimer = randRange(4, 9);
  private boltLife = 0;
  private flash = 0;
  private thunderTimer = 0;
  private boltPoints: Array<[number, number]> = [];

  /** Called shortly after a lightning flash so the caller can play thunder. */
  onThunder?: () => void;

  constructor() {
    super();
    this.eventMode = "none";

    for (let i = 0; i < STAR_COUNT; i += 1) {
      this.stars.push({
        x: randRange(4, VIEW.width - 4),
        y: randRange(1, 10),
        phase: randRange(0, Math.PI * 2),
        speed: randRange(0.7, 2.1),
        size: Math.random() > 0.82 ? 2 : 1,
      });
    }

    for (let i = 0; i < DROP_COUNT; i += 1) {
      this.drops.push({
        x: randRange(-30, VIEW.width + 30),
        y: randRange(-VIEW.height, VIEW.height),
        length: randRange(4, 9),
        speed: randRange(210, 360),
      });
    }

    for (let i = 0; i < FIREFLY_COUNT; i += 1) {
      this.fireflies.push({
        x: randRange(18, VIEW.width - 18),
        y: randRange(204, 258),
        phase: randRange(0, Math.PI * 2),
        speed: randRange(0.5, 1.5),
        radius: randRange(1.4, 2.6),
      });
    }

    this.addChild(
      this.wash,
      this.sky,
      this.glow,
      this.fogG,
      this.rainG,
      this.boltG,
      this.flashG,
    );
  }

  setWorld(palette: WorldPalette, weather: WeatherDef): void {
    this.world = palette;
    this.weather = weather;
  }

  update(dt: number): void {
    this.time += dt;
    this.drawWash();
    this.drawSky();
    this.drawGlow();
    this.drawFog();
    this.drawRain(dt);
    this.drawLightning(dt);
  }

  // ------------------------------------------------------------------ layers

  private drawWash(): void {
    const g = this.wash;
    g.clear();
    if (this.world.overlayAlpha > 0.002) {
      g.rect(0, 0, VIEW.width, VIEW.height).fill({
        color: this.world.overlay,
        alpha: this.world.overlayAlpha,
      });
    }
    if (this.weather.dark > 0.002) {
      g.rect(0, 0, VIEW.width, VIEW.height).fill({
        color: 0x050b1c,
        alpha: this.weather.dark * 0.5,
      });
    }
  }

  private drawSky(): void {
    const g = this.sky;
    g.clear();
    const stars = this.world.stars;
    if (stars <= 0.02) return;

    for (const star of this.stars) {
      const twinkle =
        0.55 + Math.sin(this.time * star.speed + star.phase) * 0.45;
      g.rect(star.x, star.y, star.size, star.size).fill({
        color: star.size > 1 ? C.cream : C.steelPale,
        alpha: stars * twinkle * 0.9,
      });
    }

    // Moon and its broken reflection on the water.
    const moonX = 398;
    g.circle(moonX, 5, 10).fill({ color: 0xdfe8ff, alpha: 0.05 * stars });
    g.circle(moonX, 5, 7).fill({ color: 0xe8efff, alpha: 0.1 * stars });
    g.circle(moonX, 5, 4).fill({ color: 0xf6f8ff, alpha: 0.9 * stars });
    g.circle(moonX - 1, 4, 2).fill({ color: 0xdfe8ff, alpha: 0.55 * stars });

    for (let i = 0; i < 9; i += 1) {
      const drift = Math.sin(this.time * 0.9 + i * 1.7) * (2 + i * 0.6);
      const width = Math.max(1, 8 - i * 0.7);
      g.rect(moonX - width / 2 + drift, 16 + i * 6, width, 1).fill({
        color: 0xdce6ff,
        alpha: stars * (0.16 - i * 0.012),
      });
    }
  }

  private drawGlow(): void {
    const g = this.glow;
    g.clear();
    const lantern = this.world.lantern;
    if (lantern <= 0.02) return;

    // Warm pool of light around the angler's lantern, then fireflies.
    g.circle(240, 196, 44).fill({ color: 0xffb347, alpha: 0.035 * lantern });
    g.circle(240, 196, 27).fill({ color: 0xffc76b, alpha: 0.05 * lantern });
    g.circle(240, 196, 13).fill({ color: 0xffe3a8, alpha: 0.07 * lantern });

    for (const fly of this.fireflies) {
      const pulse = (Math.sin(this.time * fly.speed * 2.2 + fly.phase) + 1) / 2;
      const x = fly.x + Math.sin(this.time * fly.speed + fly.phase) * 9;
      const y = fly.y + Math.cos(this.time * fly.speed * 0.7 + fly.phase) * 4;
      g.circle(x, y, fly.radius * 3.4).fill({
        color: 0xffd166,
        alpha: lantern * pulse * 0.12,
      });
      g.circle(x, y, fly.radius).fill({
        color: 0xffef9a,
        alpha: lantern * (0.25 + pulse * 0.55),
      });
    }
  }

  private drawFog(): void {
    const g = this.fogG;
    g.clear();
    const fog = this.weather.fog;
    if (fog <= 0.02) return;

    g.rect(0, 0, VIEW.width, VIEW.height).fill({
      color: 0xdbe6ea,
      alpha: fog * 0.07,
    });

    for (let i = 0; i < 9; i += 1) {
      const speed = 9 + (i % 4) * 4;
      const span = VIEW.width + 260;
      const x = ((this.time * speed + i * 73) % span) - 130;
      const y = 24 + i * 26 + Math.sin(this.time * 0.6 + i) * 4;
      const rx = 150 + (i % 3) * 34;
      g.ellipse(x, y, rx, 13).fill({
        color: 0xe6eef1,
        alpha: fog * (0.045 + (i % 3) * 0.012),
      });
    }
  }

  private drawRain(dt: number): void {
    const g = this.rainG;
    g.clear();
    const rain = this.weather.rain;
    if (rain <= 0.02) {
      this.splashes = [];
      return;
    }

    const count = Math.floor(this.drops.length * rain);
    const wind = 34 + rain * 26;
    for (let i = 0; i < count; i += 1) {
      const drop = this.drops[i];
      const speed = drop.speed * (0.7 + rain * 0.6);
      drop.y += speed * dt;
      drop.x += wind * dt;
      if (drop.y > VIEW.height + 10) {
        drop.y = randRange(-40, -8);
        drop.x = randRange(-30, VIEW.width + 30);
      }
      if (drop.x > VIEW.width + 30) drop.x = -30;
      const length = drop.length * (0.7 + rain * 0.6);
      g.moveTo(drop.x, drop.y)
        .lineTo(drop.x - length * 0.28, drop.y + length)
        .stroke({
          width: 1,
          color: rain > 0.9 ? 0xcfe6ff : 0xa8d4ee,
          alpha: 0.18 + rain * 0.2,
        });
    }

    if (Math.random() < dt * 34 * rain) {
      this.splashes.push({
        x: randRange(10, VIEW.width - 10),
        y: randRange(22, 228),
        life: 0.34,
        maxLife: 0.34,
      });
    }

    this.splashes = this.splashes.filter((splash) => {
      splash.life -= dt;
      if (splash.life <= 0) return false;
      const t = 1 - splash.life / splash.maxLife;
      g.ellipse(splash.x, splash.y, 1 + t * 3.4, 0.6 + t * 1.3).stroke({
        width: 1,
        color: 0xcfe6ff,
        alpha: (1 - t) * 0.32,
      });
      return true;
    });
  }

  private drawLightning(dt: number): void {
    if (this.weather.flash) {
      this.boltTimer -= dt;
      if (this.boltTimer <= 0) {
        this.boltTimer = randRange(4.5, 11);
        this.flash = 1;
        this.boltLife = 0.26;
        this.thunderTimer = randRange(0.4, 1.2);
        this.makeBolt();
      }
    }

    if (this.thunderTimer > 0) {
      this.thunderTimer -= dt;
      if (this.thunderTimer <= 0) this.onThunder?.();
    }

    const bolt = this.boltG;
    bolt.clear();
    if (this.boltLife > 0) {
      this.boltLife -= dt;
      if (this.boltPoints.length > 1) {
        bolt.moveTo(this.boltPoints[0][0], this.boltPoints[0][1]);
        for (let i = 1; i < this.boltPoints.length; i += 1) {
          bolt.lineTo(this.boltPoints[i][0], this.boltPoints[i][1]);
        }
        bolt.stroke({ width: 3, color: 0xfff6c8, alpha: 0.22 });
        bolt.moveTo(this.boltPoints[0][0], this.boltPoints[0][1]);
        for (let i = 1; i < this.boltPoints.length; i += 1) {
          bolt.lineTo(this.boltPoints[i][0], this.boltPoints[i][1]);
        }
        bolt.stroke({ width: 1, color: 0xffffff, alpha: 0.9 });
      }
    }

    const flash = this.flashG;
    flash.clear();
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3.2);
      flash.rect(0, 0, VIEW.width, VIEW.height).fill({
        color: 0xf4f8ff,
        alpha: this.flash * 0.34,
      });
    }
  }

  private makeBolt(): void {
    const x = randRange(60, VIEW.width - 60);
    const points: Array<[number, number]> = [[x, 0]];
    let px = x;
    let py = 0;
    const steps = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < steps; i += 1) {
      px += randRange(-13, 13);
      py += randRange(7, 13);
      points.push([px, py]);
    }
    this.boltPoints = points;
  }
}
