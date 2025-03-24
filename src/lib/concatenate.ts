import { ProcessedRedditVideoPostWithMetadata } from "./types";
import { getVideoDuration } from "./video-metadata";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import ora from "ora";

export async function concatenateWithTransitions(
  posts: ProcessedRedditVideoPostWithMetadata[],
  outputFilePath: string,
  debug = false,
  transitionDuration = 1,
): Promise<void> {
  const durations = posts.map((post) => getVideoDuration(post));

  const { filterChain, finalVideoLabel, finalAudioLabel } =
    buildXfadeFilterChain(posts.length, durations, transitionDuration);

  console.log("\nConcatenating videos with transitions...");

  const spinner = ora({
    text: "Starting ffmpeg with transitions...",
    color: "cyan",
  }).start();

  spinner.color = "cyan";

  await new Promise<void>((resolve, reject) => {
    // Build command
    const command = ffmpeg();

    posts.forEach((post) => {
      command.input(post.outputPath);
    });

    command
      .complexFilter(filterChain, [finalVideoLabel, finalAudioLabel])
      .outputOptions("-movflags", "+faststart")
      .on("stderr", (line) => {
        if (debug) {
          console.log(line);
        }
      })
      .on("progress", (progress) => {
        if (progress.percent) {
          spinner.text = `Progress: ${Math.round(progress.percent)}% frames: ${progress.frames} fps: ${progress.currentFps} speed: ${progress.currentKbps} kbps time: ${progress.timemark} Tsize: ${progress.targetSize}`;
        }
      })
      .on("end", () => {
        spinner.succeed("Final video created -> " + outputFilePath);
        resolve();
      })
      .on("error", (err) => {
        spinner.text = "❌ Error during ffmpeg with transitions.";
        spinner.fail();
        reject(err);
      })
      .save(outputFilePath);
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
