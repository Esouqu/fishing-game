import { Container, Graphics } from "pixi.js";
import { VIEW } from "../config";
import type { AreaMood } from "../areas";
import type { WeatherDef, WorldPalette } from "../world";
import { WEATHER, WINTER, mixColor } from "../world";
import { clamp, randRange } from "../utils";
import { FogLayer } from "./fog";

interface Flake {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  phase: number;
  /** How much the wind pushes this flake, so the sheet never moves as a block. */
  wind: number;
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
/**
 * Flake pool. A clear sky uses none of it and a snowfall a quarter, so the pool
 * has to be big enough for the blizzard: at full gust every one of these is on
 * screen.
 */
const FLAKE_COUNT = 820;
/** Time constant for a weather front easing into the scene. */
const WEATHER_BLEND_SECONDS = 8;

interface WeatherVisual {
  snow: number;
  gust: number;
  fog: number;
  dark: number;
  /** Cloud cover, 0..1: the grey lid and the shadows on the water. */
  cloud: number;
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
  /** Dark cloud bank around the frame; see `fog.ts`. */
  private readonly fog = new FogLayer();
  private readonly snowG = new Graphics();

  private readonly flakes: Flake[] = [];
  private readonly stars: Star[] = [];
  private splashes: Splash[] = [];

  private world: WorldPalette = DAY;
  private weather: WeatherDef = WEATHER.clear;
  private weatherReady = false;
  private readonly visual: WeatherVisual = {
    snow: WEATHER.clear.snow,
    gust: WEATHER.clear.gust,
    fog: WEATHER.clear.fog,
    dark: WEATHER.clear.dark,
    cloud: WEATHER.clear.cloud,
  };
  private time = 0;
  /** Phase offsets so the gust pattern differs between sessions. */
  private readonly gustSeed = randRange(0, Math.PI * 2);
  /**
   * Bearing of the current front, -1..1, picked once when the front arrives.
   *
   * A blizzard used to swing round every few seconds, which read as a flag
   * snapping in a machine-made wind. A real front keeps one bearing for its
   * whole life; `windDir` only eases towards it, so the first seconds of a
   * front do not flip the snow sheet sideways. The gust envelope still makes
   * the speed pulse, so the snow arrives in bursts without changing sides.
   */
  private windDir = 1;
  private windTarget = 1;

  private lightX: number | null = null;
  private lightY: number | null = null;
  /**
   * Open-water test of the current scene. A drop of snow or rain only lands
   * where there is water to ring; without it the whole frame took splashes,
   * including the pier planks and the snow banks.
   */
  private isWater: ((x: number, y: number) => boolean) | null = null;
  private mood: AreaMood = {
    dark: 0,
    snow: 1,
    wind: 0,
    overlay: 0xffffff,
    overlayAlpha: 0,
  };

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
        wind: randRange(0.5, 1.35),
      });
    }

    this.addChild(this.wash, this.sky, this.glow, this.fog, this.snowG);
  }

  /** Area-specific mood layered on top of the shared weather. */
  setMood(mood: AreaMood): void {
    this.mood = mood;
  }

  /**
   * Where the angler stands. Fog closes in around him: the clear pocket follows
   * him, so what the player can see is the water he is actually fishing.
   */
  setFocus(x: number, y: number): void {
    this.fog.setFocus(x, y);
  }

  /** Warm light position for the night glow (null hides it). */
  setLight(x: number | null, y: number | null): void {
    this.lightX = x;
    this.lightY = y;
  }

  /**
   * Tells the atmosphere where the open water is, so the splash rings of
   * falling snow stay on it. The scene owns the geometry; this layer only asks.
   */
  setWaterTest(test: ((x: number, y: number) => boolean) | null): void {
    this.isWater = test;
  }

  setWorld(palette: WorldPalette, weather: WeatherDef): void {
    this.world = palette;
    if (weather.id === this.weather.id && this.weatherReady) return;
    this.weather = weather;
    // A new front brings its own bearing and keeps it until the next one.
    this.pickWindBearing();
    if (!this.weatherReady) {
      // The first frame of a session shows the current front immediately;
      // transitions only matter when the clock rolls into a new one.
      this.visual.snow = weather.snow;
      this.visual.gust = weather.gust;
      this.visual.fog = weather.fog;
      this.visual.dark = weather.dark;
      this.visual.cloud = weather.cloud;
      this.weatherReady = true;
    }
  }

  /**
   * Dev hook: switch the front on the spot instead of easing into it. A front
   * that rolled in on its own takes seconds to blend; a dev pick has to be in
   * front of the player immediately.
   */
  snapTo(weather: WeatherDef): void {
    this.weather = weather;
    this.pickWindBearing();
    this.weatherReady = true;
    this.visual.snow = weather.snow;
    this.visual.gust = weather.gust;
    this.visual.fog = weather.fog;
    this.visual.dark = weather.dark;
    this.visual.cloud = weather.cloud;
  }

  update(dt: number): void {
    this.time += dt;
    this.smoothWeather(dt);
    this.drawWash();
    this.drawSky();
    this.drawGlow();
    this.updateFog(dt);
    this.drawSnow(dt);
  }

  private smoothWeather(dt: number): void {
    if (!this.weatherReady) return;
    const k = 1 - Math.exp(-dt / WEATHER_BLEND_SECONDS);
    const target = this.weather;
    this.visual.snow += (target.snow - this.visual.snow) * k;
    this.visual.gust += (target.gust - this.visual.gust) * k;
    this.visual.fog += (target.fog - this.visual.fog) * k;
    this.visual.dark += (target.dark - this.visual.dark) * k;
    this.visual.cloud += (target.cloud - this.visual.cloud) * k;
  }

  /**
   * Wind speed multiplier, 0..1.4, as a sum of three incommensurate waves.
   *
   * A constant push reads as a fan rather than as weather; a blizzard arrives
   * in bursts, so the flakes are driven by this envelope instead of a fixed
   * horizontal speed. The waves never repeat inside a session, which is what
   * makes the gusts feel random without a timer.
   */
  private gustAt(time: number): number {
    const seed = this.gustSeed;
    const value =
      0.5 +
      Math.sin(time * 0.41 + seed) * 0.28 +
      Math.sin(time * 1.27 + seed * 2.1) * 0.16 +
      Math.sin(time * 0.19 + seed * 3.7) * 0.22;
    return clamp(value, 0.05, 1.4);
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
    if (this.mood.overlayAlpha > 0.002) {
      g.rect(0, 0, VIEW.width, VIEW.height).fill({
        color: this.mood.overlay,
        alpha: this.mood.overlayAlpha,
      });
    }
    const dark = this.visual.dark + this.mood.dark;
    if (dark > 0.002) {
      g.rect(0, 0, VIEW.width, VIEW.height).fill({
        color: 0x050b1c,
        alpha: dark * 0.5,
      });
    }
    // A grey lid over the whole frame: an overcast sky is not just a bit
    // darker, it drains the colour out of the snow and the water.
    const cloud = this.visual.cloud;
    if (cloud > 0.02) {
      g.rect(0, 0, VIEW.width, VIEW.height).fill({
        color: 0x6d8296,
        alpha: cloud * 0.13,
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
    if (lantern <= 0.02 || this.lightX === null || this.lightY === null) return;

    // Warm pool of light around the area's lamp/fire. Several low-alpha rings
    // read as a soft wash instead of hard circles.
    const x = this.lightX;
    const y = this.lightY - 7;
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

  /**
   * Fog is a framing device now, not a full-frame wash: dark cloud banks close
   * in from the edges and leave a clearing around the water the player is
   * fishing. Heavy weather thickens the banks instead of greying everything out.
   */
  /**
   * Fog is its own weather, not a permanent dressing: the other fronts keep the
   * plain scene, and only a fog front pulls the bank in around the angler. The
   * density ramps in over the front's own blend, so the layer creeps up instead
   * of popping on.
   */
  private updateFog(dt: number): void {
    const density = clamp((this.visual.fog - 0.3) / 0.7);
    // Pale frozen air, not a dark cloud: winter fog is lit from above, so it
    // reads as a bright wash that swallows the far bank. A dark tint over dark
    // water looked like a dimmed screen instead of mist, and pure snow white
    // was brighter than the snow itself.
    this.fog.setDensity(density, mixColor(WINTER.snow, 0x93aebd, 0.38));
    this.fog.tick(dt);
  }

  private drawSnow(dt: number): void {
    const g = this.snowG;
    g.clear();

    // The blizzard is wind before it is density: the gust envelope sets both
    // the sideways speed and how far each flake is smeared into a streak.
    const gust = this.gustAt(this.time);
    this.updateWind(dt);
    const windSpeed = this.visual.gust * (26 + gust * 104);
    const wind = windSpeed * this.windDir;
    const streak = Math.abs(wind) * 0.04;

    // Cold air whitened by the snow it carries. Drawn under the flakes, and
    // only during a real gust, so a calm snowfall never fogs the frame.
    if (this.visual.gust > 0.05 && gust > 0.45) {
      g.rect(0, 0, VIEW.width, VIEW.height).fill({
        color: 0xdff0f8,
        alpha: 0.08 * this.visual.gust * (gust - 0.35),
      });
    }

    // A gust carries more snow with it, so density follows the same envelope
    // (with the baseline restored, so calm fronts keep their usual count).
    const gustDensity = 1 + this.visual.gust * (gust * 0.35 - 0.35);
    // Snowfall comes only from the front: a clear or overcast sky drops
    // nothing, which is what makes the clear sky read as clear.
    const intensity =
      (this.visual.snow * 0.2 + this.visual.gust * 0.85) *
      this.mood.snow *
      gustDensity;
    const count = Math.min(
      this.flakes.length,
      Math.floor(this.flakes.length * intensity),
    );
    const fallScale =
      1 + this.visual.snow * 1.1 + this.visual.gust * gust * 0.9;

    for (let i = 0; i < count; i += 1) {
      const flake = this.flakes[i];
      flake.y += flake.speed * fallScale * dt;
      const push = wind * flake.wind;
      flake.x +=
        (flake.drift + Math.sin(this.time * 0.9 + flake.phase) * 5 + push) * dt;
      if (flake.y > VIEW.height + 4) {
        flake.y = -4;
        flake.x = randRange(-20, VIEW.width + 20);
      }
      if (flake.x > VIEW.width + 20) flake.x = -20;
      if (flake.x < -20) flake.x = VIEW.width + 20;

      // Fast snow reads as short horizontal smears rather than round dots, and
      // the flakes closest to the camera grow a pixel at the top of a gust.
      const smear = streak > 0.35 ? streak * (0.25 + flake.wind * 0.35) : 0;
      const grow = gust > 0.9 && this.visual.gust > 0.6 ? 1 : 0;
      const size = flake.size + grow;
      // The smear trails behind the flake, so it points the way the wind blows:
      // to the left of a rightward gust and to the right of a leftward one.
      const tail = this.windDir >= 0 ? -smear : 0;
      g.rect(flake.x + tail, flake.y, size + smear, size).fill({
        color: WINTER.snow,
        alpha:
          (flake.size > 1 ? 0.82 : 0.5) * (1 - Math.min(0.2, smear * 0.06)),
      });
    }

    // Horizontal wind streaks for an exposed reach of river. They follow the
    // same bearing as the snow, so the whole frame blows one way.
    if (this.mood.wind > 0.01) {
      for (let i = 0; i < 18; i += 1) {
        const travel = (this.time * (170 + (i % 5) * 30) + i * 53) % 540;
        const x = this.windDir >= 0 ? travel - 45 : VIEW.width + 45 - travel;
        const y = 18 + ((i * 29) % (VIEW.height - 30));
        const length = 8 + (i % 4) * 5;
        g.rect(x, y, length, 1).fill({
          color: WINTER.frost,
          alpha:
            0.05 *
            this.mood.wind *
            (0.5 + (i % 3) * 0.25) *
            Math.abs(this.windDir),
        });
      }
    }

    // Snow landing on the water leaves tiny, short-lived rings. The spot is
    // drawn from the water body's own outline, so a drop never rings on the
    // pier, the bank or the snowfield behind it.
    if (Math.random() < dt * 14 * intensity) {
      const spot = this.pickWaterSpot();
      if (spot) {
        this.splashes.push({
          x: spot.x,
          y: spot.y,
          life: 0.34,
          maxLife: 0.34,
        });
      }
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

  /**
   * A point on open water for a splash ring, or `null` when this frame's roll
   * found only land. The frame is mostly water on the lake and the bay, so a
   * few tries are enough; the river channel is narrower, hence the wider cap.
   */
  private pickWaterSpot(): { x: number; y: number } | null {
    const isWater = this.isWater;
    if (!isWater) return null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const x = randRange(10, VIEW.width - 10);
      const y = randRange(26, 228);
      if (isWater(x, y)) return { x, y };
    }
    return null;
  }

  /**
   * Picks the bearing a front will keep. The strength stays in ±0.45..1 so the
   * snow always has a real slant: a dead calm would drop it straight down and
   * stop reading as a blizzard.
   */
  private pickWindBearing(): void {
    const strength = randRange(0.45, 1);
    this.windTarget = Math.random() < 0.5 ? -strength : strength;
  }

  /**
   * Eases the snow onto the bearing the front arrived with and holds it there
   * for the rest of the front.
   */
  private updateWind(dt: number): void {
    this.windDir += (this.windTarget - this.windDir) * Math.min(1, dt * 1.1);
  }
}
