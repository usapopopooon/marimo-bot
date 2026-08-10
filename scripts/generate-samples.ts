import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderTankImage, type TankImageInput } from "../src/rendering/tank.js";

const samples: { filename: string; input: TankImageInput }[] = [
  {
    filename: "day-1-10mm.png",
    input: { seed: "sample:newborn", sizeMm: 10, ageDays: 1 }
  },
  {
    filename: "day-87-42mm.png",
    input: { seed: "sample:growing", sizeMm: 42.5, ageDays: 87 }
  },
  {
    filename: "day-968-300mm.png",
    input: { seed: "sample:giant", sizeMm: 300, ageDays: 968 }
  },
  {
    filename: "memorial-50mm.png",
    input: {
      seed: "sample:memorial",
      sizeMm: 50,
      ageDays: 135,
      dead: true
    }
  }
];

const outputDirectory = resolve(process.cwd(), "public/samples");
await mkdir(outputDirectory, { recursive: true });

for (const sample of samples) {
  const image = await renderTankImage(sample.input);
  await writeFile(resolve(outputDirectory, sample.filename), image);
}

console.log(`Generated ${samples.length} samples in ${outputDirectory}`);
