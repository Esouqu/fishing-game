import { Container, Graphics } from "pixi.js";
import { SCENE, VIEW } from "../config";
import type { WeatherDef, WorldPalette } from "../world";
import { WEATHER, WINTER } from "../world";
import { randRange } from "../utils";

interface Flake {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  phase: number;
}

interface Star {
  x: number;
  y: number;
  phase: number;
  speed: number;
  size: number;
}

interface Splash {
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

const DAY: WorldPalette = {
  tint: 0xf3f9ff,
  overlay: 0xffffff,
  overlayAlpha: 0,
  stars: 0,
  lantern: 0,
  water: WINTER.waterDeep,
  deep: WINTER.waterFar,
};

const STAR_COUNT = 44;
const FLAKE_COUNT = 190;
/** Even a clear winter sky keeps a light snowfall going. */
const BASE_SNOW = 0.34;
/** Time constant for a weather front easing into the scene. */
const WEATHER_BLEND_SECONDS = 8;

interface WeatherVisual {
  rain: number;
  fog: number;
  dark: number;
  flash: number;
}

/**
 * Weather and time-of-day dressing for the winter lake. It never adds HUD
 * text: snow, frost, cold moonlight and lightning tell the player what the
 * world is doing. Intended to sit directly above the scene and below the HUD.
 */
export class Atmosphere extends Container {
  private readonly wash = new Graphics();
  private readonly sky = new Graphics();
  private readonly glow = new Graphics();
  private readonly fogG = new Graphics();
  private readonly snowG = new Graphics();
  private readonly boltG = new Graphics();
  private readonly flashG = new Graphics();

  private readonly flakes: Flake[] = [];
  private readonly stars: Star[] = [];
  private splashes: Splash[] = [];

  private world: WorldPalette = DAY;
  private weather: WeatherDef = WEATHER.clear;
  private weatherReady = false;
  private readonly visual: WeatherVisual = {
    rain: WEATHER.clear.rain,
    fog: WEATHER.clear.fog,
    dark: WEATHER.clear.dark,
    flash: 0,
  };
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

    for (let i = 0; i < FLAKE_COUNT; i += 1) {
      this.flakes.push({
        x: randRange(-20, VIEW.width + 20),
        y: randRange(-VIEW.height, VIEW.height),
        size: Math.random() > 0.78 ? 2 : 1,
        speed: randRange(12, 34),
        drift: randRange(3, 13),
        phase: randRange(0, Math.PI * 2),
      });
    }

    this.addChild(
      this.wash,
      this.sky,
      this.glow,
      this.fogG,
      this.snowG,
      this.boltG,
      this.flashG,
    );
  }

  setWorld(palette: WorldPalette, weather: WeatherDef): void {
    this.world = palette;
    if (weather.id === this.weather.id && this.weatherReady) return;
    this.weather = weather;
    if (!this.weatherReady) {
      // The first frame of a session shows the current front immediately;
      // transitions only matter when the clock rolls into a new one.
      this.visual.rain = weather.rain;
      this.visual.fog = weather.fog;
      this.visual.dark = weather.dark;
      this.visual.flash = weather.flash ? 1 : 0;
      this.weatherReady = true;
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.smoothWeather(dt);
    this.drawWash();
    this.drawSky();
    this.drawGlow();
    this.drawFog();
    this.drawSnow(dt);
    this.drawLightning(dt);
  }

  private smoothWeather(dt: number): void {
    if (!this.weatherReady) return;
    const k = 1 - Math.exp(-dt / WEATHER_BLEND_SECONDS);
    const target = this.weather;
    this.visual.rain += (target.rain - this.visual.rain) * k;
    this.visual.fog += (target.fog - this.visual.fog) * k;
    this.visual.dark += (target.dark - this.visual.dark) * k;
    this.visual.flash += ((target.flash ? 1 : 0) - this.visual.flash) * k;
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
    if (this.visual.dark > 0.002) {
      g.rect(0, 0, VIEW.width, VIEW.height).fill({
        color: 0x050b1c,
        alpha: this.visual.dark * 0.5,
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
        color: star.size > 1 ? WINTER.moon : WINTER.star,
        alpha: stars * twinkle * 0.85,
      });
    }

    // Cold moon and its broken reflection on the water.
    const moonX = 398;
    g.circle(moonX, 5, 10).fill({
      color: 0xcfe2ff,
      alpha: 0.05 * stars,
    });
    g.circle(moonX, 5, 7).fill({
      color: 0xe4efff,
      alpha: 0.1 * stars,
    });
    g.circle(moonX, 5, 4).fill({ color: WINTER.moon, alpha: 0.9 * stars });
    g.circle(moonX - 1, 4, 2).fill({
      color: 0xd6e6ff,
      alpha: 0.6 * stars,
    });

    for (let i = 0; i < 9; i += 1) {
      const drift = Math.sin(this.time * 0.9 + i * 1.7) * (2 + i * 0.6);
      const width = Math.max(1, 8 - i * 0.7);
      g.rect(moonX - width / 2 + drift, 16 + i * 6, width, 1).fill({
        color: 0xdbe8ff,
        alpha: stars * (0.16 - i * 0.012),
      });
    }
  }

  private drawGlow(): void {
    const g = this.glow;
    g.clear();
    const lantern = this.world.lantern;
    if (lantern <= 0.02) return;

    // Warm pool of light around the pier lantern at the top-right corner.
    // Several low-alpha rings read as a soft wash instead of hard circles.
    const x = SCENE.lanternX;
    const y = SCENE.lanternY - 7;
    for (let i = 0; i < 8; i += 1) {
      const t = i / 7;
      const radius = 44 * (1 - t * 0.82);
      const alpha = (0.008 + t * 0.03) * lantern;
      g.circle(x, y, radius).fill({
        color: t < 0.35 ? 0xffb347 : t < 0.7 ? 0xffc76b : 0xffe3a8,
        alpha,
      });
    }
  }

  private drawFog(): void {
    const g = this.fogG;
    g.clear();
    const fog = this.visual.fog;
    if (fog <= 0.02) return;

    // Frost haze rather than a warm summer fog.
    g.rect(0, 0, VIEW.width, VIEW.height).fill({
      color: WINTER.frost,
      alpha: fog * 0.09,
    });

    for (let i = 0; i < 9; i += 1) {
      const speed = 9 + (i % 4) * 4;
      const span = VIEW.width + 260;
      const x = ((this.time * speed + i * 73) % span) - 130;
      const y = 24 + i * 26 + Math.sin(this.time * 0.6 + i) * 4;
      const rx = 150 + (i % 3) * 34;
      g.ellipse(x, y, rx, 13).fill({
        color: WINTER.frost,
        alpha: fog * (0.05 + (i % 3) * 0.012),
      });
    }

    // A few ice crystals clinging to the frame in heavy fog.
    for (let i = 0; i < 18; i += 1) {
      const x =
        i % 2 === 0 ? 2 + ((i * 7) % 16) : VIEW.width - 4 - ((i * 11) % 18);
      const y = 26 + ((i * 31) % (VIEW.height - 40));
      g.rect(x, y, 1, 3).fill({
        color: WINTER.snowLight,
        alpha: fog * 0.35,
      });
    }
  }

  private drawSnow(dt: number): void {
    const g = this.snowG;
    g.clear();

    const intensity = BASE_SNOW + this.visual.rain * 0.66;
    const count = Math.min(
      this.flakes.length,
      Math.floor(this.flakes.length * intensity),
    );
    const fallScale = 1 + this.visual.rain * 0.8;

    for (let i = 0; i < count; i += 1) {
      const flake = this.flakes[i];
      flake.y += flake.speed * fallScale * dt;
      flake.x +=
        (flake.drift + Math.sin(this.time * 0.9 + flake.phase) * 5) * dt;
      if (flake.y > VIEW.height + 4) {
        flake.y = -4;
        flake.x = randRange(-20, VIEW.width + 20);
      }
      if (flake.x > VIEW.width + 20) flake.x = -20;
      if (flake.x < -20) flake.x = VIEW.width + 20;

      g.rect(flake.x, flake.y, flake.size, flake.size).fill({
        color: WINTER.snow,
        alpha: flake.size > 1 ? 0.82 : 0.5,
      });
    }

    // Snow landing on the water leaves tiny, short-lived rings.
    if (Math.random() < dt * 14 * intensity) {
      this.splashes.push({
        x: randRange(10, VIEW.width - 10),
        y: randRange(26, 228),
        life: 0.34,
        maxLife: 0.34,
      });
    }

    this.splashes = this.splashes.filter((splash) => {
      splash.life -= dt;
      if (splash.life <= 0) return false;
      const t = 1 - splash.life / splash.maxLife;
      g.ellipse(splash.x, splash.y, 1 + t * 3.2, 0.6 + t * 1.2).stroke({
        width: 1,
        color: WINTER.snow,
        alpha: (1 - t) * 0.3,
      });
      return true;
    });
  }

  private drawLightning(dt: number): void {
    if (this.visual.flash > 0.5) {
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
