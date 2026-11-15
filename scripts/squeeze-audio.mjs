#!/usr/bin/env node
/**
 * Squeezes the runtime WAVs: stereo 44.1 kHz → mono ~22.05 kHz 16-bit PCM.
 *
 * The sound pack ships as uncompressed stereo PCM: 20 MB for 27 effects, the
 * largest single payload of the whole game. The ambience beds and cues are
 * noise- and texture-heavy one-shots mixed under the game, so halving the
 * bandwidth and folding the channels costs nothing audible while cutting the
 * bytes 4×. A box filter is applied before decimation, so the downsampled bed
 * does not alias.
 *
 * The whole file is resampled, not a slice of it: ambient loops play the full
 * buffer (`source.loop = true`), so the loop point stays exactly where it was.
 *
 * Usage:
 *   node scripts/squeeze-audio.mjs [dir] [--dry]
 *
 * The script is idempotent: files that are already mono and <= 24 kHz are
 * skipped, so it is safe to run after every `pnpm assets`.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const dirArg = args.find((arg) => !arg.startsWith("--"));
const dir = resolve(dirArg ?? "public/assets/fishing/sounds");
const TARGET_RATE = 22050;
/** Files already at or below this rate are considered squeezed. */
const SQUEEZED_RATE = 24000;

const files = readdirSync(dir)
  .filter((name) => name.endsWith(".wav"))
  .sort();

let before = 0;
let after = 0;
let skipped = 0;

for (const name of files) {
  const path = join(dir, name);
  const size = statSync(path).size;
  const wav = parseWav(readFileSync(path));
  if (!wav) {
    console.warn(`[audio] ${name}: unsupported WAV, left untouched`);
    skipped += 1;
    before += size;
    after += size;
    continue;
  }
  before += size;
  if (wav.channels === 1 && wav.sampleRate <= SQUEEZED_RATE) {
    skipped += 1;
    after += size;
    continue;
  }

  const mono = downmix(wav);
  const targetRate = Math.max(8000, Math.round(wav.sampleRate / 2));
  const squeezed = resample(mono, wav.sampleRate, targetRate);
  const bytes = encodeWav16(squeezed, targetRate);
  if (!dry) writeFileSync(path, bytes);
  after += dry ? size : bytes.length;
  console.log(
    `[audio] ${name}: ${(size / 1048576).toFixed(2)} MB → ` +
      `${(bytes.length / 1048576).toFixed(2)} MB ` +
      `(${wav.channels}ch ${wav.sampleRate} Hz → 1ch ${targetRate} Hz)`,
  );
}

const summary =
  `[audio] ${files.length} files, ${skipped} skipped: ` +
  `${(before / 1048576).toFixed(2)} MB → ${(after / 1048576).toFixed(2)} MB` +
  (dry ? " (dry run)" : "");
console.log(summary);

/** Minimal RIFF/WAVE reader for 16-bit PCM; returns null for anything else. */
function parseWav(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      fmt = {
        format: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bits: buffer.readUInt16LE(start + 14),
      };
    } else if (id === "data") {
      data = buffer.subarray(start, Math.min(start + size, buffer.length));
    }
    offset = start + size + (size & 1);
  }
  if (!fmt || !data) return null;
  if (fmt.format !== 1 || fmt.bits !== 16) return null;
  return { ...fmt, data };
}

function downmix(wav) {
  const frames = Math.floor(wav.data.length / (wav.channels * 2));
  const mono = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < wav.channels; channel += 1) {
      sum += wav.data.readInt16LE((frame * wav.channels + channel) * 2);
    }
    mono[frame] = sum / wav.channels / 32768;
  }
  return mono;
}

/**
 * Box-filter resampling: each output sample averages the input samples that
 * fall into its own window. For the 2× ratio used here this is a proper
 * anti-alias filter; for other ratios it still behaves as a low-pass.
 */
function resample(input, inputRate, outputRate) {
  const ratio = inputRate / outputRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = i * ratio;
    const end = Math.min(input.length, (i + 1) * ratio);
    const from = Math.floor(start);
    const to = Math.max(from + 1, Math.ceil(end));
    let sum = 0;
    let count = 0;
    for (let index = from; index < to && index < input.length; index += 1) {
      sum += input[index];
      count += 1;
    }
    output[i] = count > 0 ? sum / count : 0;
  }
  return output;
}

function encodeWav16(samples, sampleRate) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
}
