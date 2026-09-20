import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "assets", "music");

const tracks = [
  { id: "corporate-light", name: "Corporate Light", category: "Profesional", mood: "Suave", filename: "corporate-light.wav", duration: 30, chords: [196, 246.94, 329.63], pulse: 98, volume: 0.11 },
  { id: "modern-technology", name: "Modern Technology", category: "Tecnología", mood: "Moderna", filename: "modern-technology.wav", duration: 30, chords: [220, 277.18, 369.99], pulse: 110, volume: 0.1 },
  { id: "upbeat-business", name: "Upbeat Business", category: "Comercial", mood: "Energética", filename: "upbeat-business.wav", duration: 30, chords: [246.94, 311.13, 415.3], pulse: 123, volume: 0.1 },
  { id: "soft-ambient", name: "Soft Ambient", category: "Elegante", mood: "Tranquila", filename: "soft-ambient.wav", duration: 30, chords: [174.61, 220, 293.66], pulse: 87, volume: 0.09 },
  { id: "minimal-electronic", name: "Minimal Electronic", category: "Tecnología", mood: "Minimal", filename: "minimal-electronic.wav", duration: 30, chords: [185, 233.08, 311.13], pulse: 104, volume: 0.1 },
  { id: "inspiring-saas", name: "Inspiring SaaS", category: "Corporativa", mood: "Inspiradora", filename: "inspiring-saas.wav", duration: 30, chords: [207.65, 261.63, 349.23], pulse: 102, volume: 0.11 }
];

await mkdir(outDir, { recursive: true });
for (const track of tracks) {
  await writeFile(path.join(outDir, track.filename), createTrack(track));
}

await writeFile(
  path.join(outDir, "library.json"),
  JSON.stringify(
    tracks.map(({ chords, pulse, volume, ...track }) => ({
      ...track,
      license: "Propia / generada localmente para FullPOS Ad Studio",
      source: "scripts/create-music-library.mjs"
    })),
    null,
    2
  )
);

function createTrack(track) {
  const sampleRate = 44_100;
  const channels = 2;
  const seconds = track.duration;
  const totalSamples = Math.floor(seconds * sampleRate);
  const dataSize = totalSamples * channels * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const fade = Math.min(1, t / 1.2, (seconds - t) / 1.4);
    const bar = Math.floor(t / 2) % 4;
    const chordShift = [1, 1.125, 0.875, 1.25][bar];
    const chord = track.chords.reduce((sum, freq, index) => sum + Math.sin(2 * Math.PI * freq * chordShift * t) * [0.34, 0.22, 0.14][index], 0);
    const pulse = Math.sin(2 * Math.PI * track.pulse * t) * 0.06;
    const tick = Math.sin(2 * Math.PI * track.pulse * 2 * t) * (Math.sin(2 * Math.PI * 2 * t) > 0.75 ? 0.035 : 0);
    const sample = Math.max(-1, Math.min(1, (chord + pulse + tick) * track.volume * fade));
    const value = Math.round(sample * 32767);
    const offset = 44 + i * channels * 2;
    buffer.writeInt16LE(value, offset);
    buffer.writeInt16LE(Math.round(value * 0.96), offset + 2);
  }
  return buffer;
}
