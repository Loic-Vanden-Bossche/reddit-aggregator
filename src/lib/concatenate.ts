import { ProcessedRedditVideoPostWithMetadata } from "./types";
import { getVideoDuration } from "./video-metadata";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";

export async function concatenateWithTransitions(
  posts: ProcessedRedditVideoPostWithMetadata[],
  outputFilePath: string,
  debug = false,
  transitionDuration = 1,
): Promise<void> {
  const durations = posts.map((post) => getVideoDuration(post));

  const { filterChain, finalVideoLabel, finalAudioLabel } =
    buildXfadeFilterChain(posts.length, durations, transitionDuration);

  await new Promise<void>((resolve, reject) => {
    // Build command
    const command = ffmpeg();

    posts.forEach((post) => {
      command.input(post.outputPath);
    });

    command
      .complexFilter(filterChain, [finalVideoLabel, finalAudioLabel])
      .outputOptions("-movflags", "+faststart")
      .on("start", () => console.log("\nStarting ffmpeg with transitions..."))
      .on("stderr", (line) => {
        if (debug) {
          console.log(line);
        }
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          console.log(`Progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on("end", () => {
        console.log("✅ Done! Final video created.");
        resolve();
      })
      .on("error", (err) => {
        console.error("Error during ffmpeg with transitions:", err.message);
        reject(err);
      })
      .save(outputFilePath);
  });

  // cleanup
  posts.forEach((post) => {
    fs.unlinkSync(post.outputPath);
  });
}

export function buildXfadeFilterChain(
  videoCount: number,
  durations: number[],
  transitionDuration: number = 1,
  safeMargin: number = 0,
): {
  filterChain: ffmpeg.FilterSpecification[];
  finalVideoLabel: string;
  finalAudioLabel: string;
} {
  if (videoCount < 2) {
    throw new Error("At least two videos are required for xfade transitions.");
  }

  const filterChain: ffmpeg.FilterSpecification[] = [];

  let offsetAccumulator = durations[0] - transitionDuration;
  let videoOffset = offsetAccumulator - safeMargin;

  // --- VIDEO: First xfade between [0:v] and [1:v]
  filterChain.push({
    filter: "xfade",
    options: {
      transition: "fade",
      duration: transitionDuration,
      offset: videoOffset,
    },
    inputs: ["0:v", "1:v"],
    outputs: "xfade0",
  });

  // --- AUDIO: First acrossfade between [0:a] and [1:a]
  filterChain.push({
    filter: "acrossfade",
    options: {
      d: transitionDuration,
      c1: "tri", // triangular fade
      c2: "tri",
    },
    inputs: ["0:a", "1:a"],
    outputs: "afade0",
  });

  for (let i = 2; i < videoCount; i++) {
    offsetAccumulator += durations[i - 1] - transitionDuration;
    videoOffset = offsetAccumulator - safeMargin;

    // VIDEO: xfade with previous output and next input
    filterChain.push({
      filter: "xfade",
      options: {
        transition: "fade",
        duration: transitionDuration,
        offset: videoOffset,
      },
      inputs: [`xfade${i - 2}`, `${i}:v`],
      outputs: `xfade${i - 1}`,
    });

    // AUDIO: acrossfade with previous output and next input
    filterChain.push({
      filter: "acrossfade",
      options: {
        d: transitionDuration,
        c1: "tri",
        c2: "tri",
      },
      inputs: [`afade${i - 2}`, `${i}:a`],
      outputs: `afade${i - 1}`,
    });
  }

  const finalVideoLabel = `xfade${videoCount - 2}`;
  const finalAudioLabel = `afade${videoCount - 2}`;

  return { filterChain, finalVideoLabel, finalAudioLabel };
}
