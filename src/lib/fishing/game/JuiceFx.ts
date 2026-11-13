import { Filter, Rectangle, type Container } from "pixi.js";
import { VIEW } from "../config";

export type JuiceKind =
  "cast" | "hook" | "counter" | "catch" | "ready" | "escape";

const VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uAberration;
uniform float uRipple;
uniform vec2 uRippleCenter;
uniform float uBloom;
uniform vec2 uPixel;
uniform float uAspect;

void main(void) {
    vec2 uv = vTextureCoord;

    // Circular ripple around the bobber. The offset is intentionally small:
    // this is a water wobble, not a screen warp.
    vec2 delta = (uv - uRippleCenter) * vec2(uAspect, 1.0);
    float dist = length(delta);
    float wave = sin(dist * 52.0 - uTime * 18.0) * uRipple * exp(-dist * 7.0);
    uv += (dist > 0.0001 ? delta / dist : vec2(0.0)) * wave * 0.0035;

    // Edge-biased chromatic aberration for impacts.
    vec2 ca = (uv - 0.5) * uAberration * 0.004;
    vec3 color;
    color.r = texture(uTexture, uv + ca).r;
    color.g = texture(uTexture, uv).g;
    color.b = texture(uTexture, uv - ca).b;

    // Cheap selective bloom: only warm, bright pixels bleed. This picks up
    // gold rings, the lantern and caught fish without washing out the HUD.
    vec2 p = uPixel * 2.0;
    vec3 bloom = vec3(0.0);
    bloom += texture(uTexture, uv + vec2(p.x, 0.0)).rgb;
    bloom += texture(uTexture, uv + vec2(-p.x, 0.0)).rgb;
    bloom += texture(uTexture, uv + vec2(0.0, p.y)).rgb;
    bloom += texture(uTexture, uv + vec2(0.0, -p.y)).rgb;
    bloom += texture(uTexture, uv + vec2(p.x, p.y)).rgb;
    bloom += texture(uTexture, uv + vec2(-p.x, p.y)).rgb;
    bloom += texture(uTexture, uv + vec2(p.x, -p.y)).rgb;
    bloom += texture(uTexture, uv + vec2(-p.x, -p.y)).rgb;
    bloom *= 0.125;

    float lum = max(bloom.r, max(bloom.g, bloom.b));
    float warm = smoothstep(0.4, 0.9, bloom.r)
        * smoothstep(0.25, 0.8, bloom.g)
        * (1.0 - smoothstep(0.35, 0.8, bloom.b));
    color += bloom * warm * smoothstep(0.3, 0.95, lum)
        * uBloom * vec3(1.0, 0.8, 0.35);

    finalColor = vec4(clamp(color, 0.0, 1.0), texture(uTexture, vTextureCoord).a);
}
`;

const uniforms = {
  uTime: { value: 0, type: "f32" as const },
  uAberration: { value: 0, type: "f32" as const },
  uRipple: { value: 0, type: "f32" as const },
  uRippleCenter: {
    value: new Float32Array([0.5, 0.5]),
    type: "vec2<f32>" as const,
  },
  uBloom: { value: 0, type: "f32" as const },
  uPixel: {
    value: new Float32Array([1 / VIEW.width, 1 / VIEW.height]),
    type: "vec2<f32>" as const,
  },
  uAspect: { value: VIEW.width / VIEW.height, type: "f32" as const },
};

interface RuntimeUniforms {
  uTime: number;
  uAberration: number;
  uRipple: number;
  uRippleCenter: Float32Array;
  uBloom: number;
}

/**
 * One cheap post-process pass for gameplay juice. The HUD and floaters live
 * outside the filtered playfield, so text never gets chromatic aberration.
 */
export class JuiceFx {
  readonly filter: Filter;
  private readonly runtime: RuntimeUniforms;
  private target: Container | null = null;
  private attached = false;

  private aberration = 0;
  private ripple = 0;
  private bloom = 0;
  private active = false;

  constructor() {
    this.filter = Filter.from({
      gl: { vertex: VERTEX, fragment: FRAGMENT },
      resources: { juice: uniforms },
    });
    this.filter.resolution = 1;
    this.filter.padding = 2;
    this.filter.enabled = false;
    this.runtime = (
      this.filter.resources.juice as unknown as {
        uniforms: RuntimeUniforms;
      }
    ).uniforms;
  }

  attachTo(playfield: Container): void {
    this.target = playfield;
    playfield.filterArea = new Rectangle(0, 0, VIEW.width, VIEW.height);
  }

  trigger(kind: JuiceKind, x = VIEW.width / 2, y = VIEW.height / 2): void {
    this.runtime.uRippleCenter[0] = x / VIEW.width;
    this.runtime.uRippleCenter[1] = y / VIEW.height;

    let aberration = 0;
    let ripple = 0;
    let bloom = 0;

    switch (kind) {
      case "cast":
        ripple = 0.5;
        aberration = 0.06;
        bloom = 0.08;
        break;
      case "hook":
        aberration = 0.45;
        ripple = 0.25;
        bloom = 0.22;
        break;
      case "counter":
        aberration = 0.6;
        ripple = 0.1;
        bloom = 0.14;
        break;
      case "catch":
        aberration = 0.35;
        ripple = 0.2;
        bloom = 0.75;
        break;
      case "ready":
        bloom = 0.35;
        break;
      case "escape":
        aberration = 0.2;
        ripple = 0.35;
        break;
    }

    this.aberration = Math.max(this.aberration, aberration);
    this.ripple = Math.max(this.ripple, ripple);
    this.bloom = Math.max(this.bloom, bloom);
    this.active = true;
    this.filter.enabled = true;
    if (!this.attached && this.target) {
      this.target.filters = [this.filter];
      this.attached = true;
    }
    this.sync();
  }

  update(dt: number): void {
    this.runtime.uTime += dt;
    if (!this.active) return;

    this.aberration = Math.max(0, this.aberration - dt * 3.0);
    this.ripple = Math.max(0, this.ripple - dt * 1.8);
    this.bloom = Math.max(0, this.bloom - dt * 2.2);
    this.sync();

    this.active =
      this.aberration > 0.001 || this.ripple > 0.001 || this.bloom > 0.001;
    if (!this.active) {
      this.filter.enabled = false;
      if (this.attached && this.target) {
        this.target.filters = [];
        this.attached = false;
      }
    }
  }

  private sync(): void {
    this.runtime.uAberration = this.aberration;
    this.runtime.uRipple = this.ripple;
    this.runtime.uBloom = this.bloom;
  }
}
