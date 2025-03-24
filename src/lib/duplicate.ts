import { spawn } from "child_process";
import pLimit from "p-limit";
import phash from "sharp-phash";
import { createHash } from "crypto";
import ffmpeg from "fluent-ffmpeg";
import { PassThrough } from "stream";

// Optional: cache to speed up repeated checks
const hashCache = new Map<string, string>();
const concurrencyLimit = 4;
const limit = pLimit(concurrencyLimit);

async function extractFrameBuffer(videoPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const bufferChunks: Buffer[] = [];
    const passThrough = new PassThrough();

    ffmpeg(videoPath)
      .frames(1)
      .setStartTime("00:00:01.000")
      .videoFilters("scale=320:240")
      .format("image2")
      .outputOptions("-vcodec mjpeg")
      .on("error", reject)
      .on("end", () => {
        resolve(Buffer.concat(bufferChunks));
      })
      .pipe(passThrough, { end: true });

    passThrough.on("data", (chunk) => bufferChunks.push(chunk));
    passThrough.on("error", reject);
  });
}

// Generate a perceptual hash using sharp-phash
async function getVideoHash(videoPath: string): Promise<string> {
  if (hashCache.has(videoPath)) return hashCache.get(videoPath)!;

  const frameBuffer = await extractFrameBuffer(videoPath);
  const hash = await phash(frameBuffer);

  hashCache.set(videoPath, hash);
  return hash;
}

// Calculate Hamming distance between two hashes
function hammingDistance(hash1: string, hash2: string): number {
  let dist = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) dist++;
  }
  return dist;
}

// Compare a target video to others
export async function isDuplicateVideo(
  targetVideoPath: string,
  otherVideoPaths: string[],
  threshold: number = 10,
): Promise<boolean> {
  if (otherVideoPaths.length === 0) return false;

  const targetHash = await getVideoHash(targetVideoPath);

  const results = await Promise.all(
    otherVideoPaths.map((path) =>
      limit(async () => {
        const otherHash = await getVideoHash(path);
        const distance = hammingDistance(targetHash, otherHash);
        return distance <= threshold;
      }),
    ),
  );

  return results.includes(true);
}
