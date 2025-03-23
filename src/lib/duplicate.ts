import ffmpeg from "fluent-ffmpeg";
import { imageHash } from "image-hash";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { tmpdir } from "os";

const imageHashAsync = promisify(imageHash);

function extractFrame(videoPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .on("end", () => resolve())
      .on("error", reject)
      .screenshots({
        timestamps: ["10%"],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: "320x240",
      });
  });
}

function hammingDistance(hash1: string, hash2: string): number {
  let dist = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) dist++;
  }
  return dist;
}

async function getVideoHash(videoPath: string): Promise<string> {
  const tmpImagePath = path.join(tmpdir(), `${path.basename(videoPath)}.jpg`);
  await extractFrame(videoPath, tmpImagePath);
  const hash = (await imageHashAsync(tmpImagePath, 16, "hex")) as string;
  fs.unlinkSync(tmpImagePath); // cleanup
  return hash;
}

export async function isDuplicateVideo(
  targetVideoPath: string,
  otherVideoPaths: string[],
  threshold: number = 10, // Hamming distance threshold
): Promise<boolean> {
  if (otherVideoPaths.length === 0) {
    return false;
  }

  const targetHash = await getVideoHash(targetVideoPath);

  for (const otherPath of otherVideoPaths) {
    const otherHash = await getVideoHash(otherPath);
    const distance = hammingDistance(targetHash, otherHash);
    if (distance <= threshold) {
      return true;
    }
  }

  return false;
}
