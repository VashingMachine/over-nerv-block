import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sampleRate = 22_050;
const durationSeconds = 8;
const sampleCount = sampleRate * durationSeconds;
const beatTimes = Array.from({ length: 13 }, (_, index) => 1 + index * 0.5);

function deterministicNoise(sampleIndex) {
  let value = (sampleIndex + 1) * 2_654_435_761;
  value = (value ^ (value >>> 13)) * 1_597_334_677;
  return ((value ^ (value >>> 16)) >>> 0) / 2 ** 31 - 1;
}

function sampleAt(timeSeconds, sampleIndex) {
  let sample = 0;

  for (const [beatIndex, beatTime] of beatTimes.entries()) {
    const elapsed = timeSeconds - beatTime;
    if (elapsed < 0 || elapsed > 0.22) {
      continue;
    }

    const accent = beatIndex % 4 === 0 ? 1 : 0.72;
    const kickEnvelope = Math.exp(-elapsed * 24);
    const kickFrequency = 78 - elapsed * 150;
    sample +=
      Math.sin(2 * Math.PI * kickFrequency * elapsed) *
      kickEnvelope *
      accent *
      0.72;

    if (elapsed < 0.055) {
      const clickEnvelope = Math.exp(-elapsed * 80);
      sample +=
        deterministicNoise(sampleIndex + beatIndex * 97) *
        clickEnvelope *
        (beatIndex % 2 === 0 ? 0.2 : 0.13);
    }
  }

  const fadeIn = Math.min(1, timeSeconds / 0.03);
  const fadeOut = Math.min(1, (durationSeconds - timeSeconds) / 0.12);
  return Math.max(-1, Math.min(1, sample * fadeIn * fadeOut));
}

function createWaveFile() {
  const bytesPerSample = 2;
  const dataSize = sampleCount * bytesPerSample;
  const wave = Buffer.alloc(44 + dataSize);

  wave.write("RIFF", 0);
  wave.writeUInt32LE(36 + dataSize, 4);
  wave.write("WAVE", 8);
  wave.write("fmt ", 12);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * bytesPerSample, 28);
  wave.writeUInt16LE(bytesPerSample, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const timeSeconds = index / sampleRate;
    wave.writeInt16LE(
      Math.round(sampleAt(timeSeconds, index) * 32_767),
      44 + index * 2,
    );
  }

  return wave;
}

const outputPath = path.resolve("apps/web/public/audio/demo-pulse.wav");
const generatedWave = createWaveFile();

if (process.argv.includes("--check")) {
  const committedWave = await readFile(outputPath);
  if (!committedWave.equals(generatedWave)) {
    throw new Error(
      "Bundled demo audio differs from scripts/generate-demo-audio.mjs",
    );
  }
  console.log("Bundled demo audio is reproducible.");
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generatedWave);
  console.log(`Wrote ${outputPath} (${generatedWave.byteLength} bytes).`);
}
