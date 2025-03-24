import {
  ProcessedRedditVideoPost,
  ProcessedRedditVideoPostWithMetadata,
} from "./types";
import ffmpeg from "fluent-ffmpeg";
import {
  attachFfmpegMetadata,
  findFinalResolution,
  findVideoDimensions,
  hasAudioStream,
} from "./video-metadata";
import { createTextImage } from "./text-to-image";
import fs from "fs";
import { chunkArray, createDirectoryIfNotExists } from "./utils";
import path from "path";
import cliProgress from "cli-progress";
import chalk from "chalk";

function truncateTitle(title: string, wordCount = 15) {
  const words = title.split(" ");
  const isTruncated = words.length > wordCount;

  return words.slice(0, wordCount).join(" ") + (isTruncated ? "..." : "");
}

export async function normalizeVideos(
  posts: ProcessedRedditVideoPost[],
  debug = false,
): Promise<ProcessedRedditVideoPostWithMetadata[]> {
  const bypass = (command: ffmpeg.FfmpegCommand) => {
    const bk = command.availableFormats;
    command.availableFormats = (cb: (err: any, data: any) => void) => {
      bk.bind(command)((err, data) => {
        const lavfi = {
          canDemux: true,
          canMux: true,
          description: "Lavfi",
        };
        cb(err, { ...data, lavfi });
      });
    };
  };

  const postsWithMetadata = await Promise.all(
    posts.map((post) => attachFfmpegMetadata(post)),
  );

  const { width, height } = await findFinalResolution(postsWithMetadata);

  const chunks = chunkArray(postsWithMetadata, 10);

  const normalizedPosts: ProcessedRedditVideoPostWithMetadata[] = [];

  console.log(`\nNormalizing ${postsWithMetadata.length} videos...`);

  for (const chunk of chunks) {
    const multibar = new cliProgress.MultiBar(
      {
        format:
          "Normalizing video |" +
          chalk.cyan("{bar}") +
          "| {value}% || {filename}",
        barCompleteChar: "\u2588",
        barIncompleteChar: "\u2591",
        hideCursor: true,
      },
      cliProgress.Presets.shades_grey,
    );

    const chunkProgress = chunk.map((p) =>
      multibar.create(100, 0, { filename: p.title }),
    );

    const result = await Promise.all(
      chunk.map(async (post, postIndex) => {
        const inputPath = post.outputPath;
        const subredditDir = path.join("output", post.subredditOrUser);
        createDirectoryIfNotExists(subredditDir);

        const outputPath = path.join(subredditDir, `${post.id}_normalized.mp4`);

        const textImageOutputPath = path.join(
          subredditDir,
          `${post.id}_text.png`,
        );

        const hasAudio = await hasAudioStream(post);

        createTextImage(truncateTitle(post.title), textImageOutputPath);

        const dimensions = findVideoDimensions(post);

        if (!dimensions) {
          return null;
        }

        const normalizedPost =
          await new Promise<ProcessedRedditVideoPostWithMetadata | null>(
            (resolve) => {
              const command = ffmpeg(inputPath).input(textImageOutputPath); // Overlay image input

              if (!hasAudio) {
                bypass(command);
                command
                  .input("anullsrc=channel_layout=stereo:sample_rate=48000")
                  .inputFormat("lavfi");
              }

              command
                .complexFilter(
                  [
                    // Apply scaling
                    {
                      filter: "scale",
                      options: {
                        w: width,
                        h: height,
                        force_original_aspect_ratio: "decrease",
                      },
                      inputs: "0:v",
                      outputs: "scaled",
                    },
                    // 2. Pad dynamically to match target if needed
                    {
                      filter: "pad",
                      options: {
                        w: width + 1,
                        h: height + 1,
                        x: "(ow-iw)/2",
                        y: "(oh-ih)/2",
                        color: "black",
                      },
                      inputs: "scaled",
                      outputs: "padded",
                    },
                    // Set sample aspect ratio
                    {
                      filter: "setsar",
                      options: "1",
                      inputs: "padded",
                      outputs: "sar_set",
                    },
                    // Set frames per second
                    {
                      filter: "fps",
                      options: "30",
                      inputs: "sar_set",
                      outputs: "final",
                    },
                    {
                      filter: "overlay",
                      options: {
                        x: "(main_w-overlay_w)/2", // Center horizontally
                        y: 20, // Position at the top
                      },
                      inputs: ["final", "1:v"],
                      outputs: "with_overlay",
                    },
                    {
                      filter: "anull", // You can change this to something like 'volume=1.5'
                      inputs: hasAudio ? "0:a" : "2:a", // If no audio, use silent audio
                      outputs: "audio_out",
                    },
                  ],
                  ["with_overlay", "audio_out"],
                )
                .outputOptions(
                  "-shortest",
                  "-c:v",
                  "libx264",
                  "-profile:v",
                  "high",
                  "-level:v",
                  "4.0",
                  "-pix_fmt",
                  "yuv420p",
                  "-c:a",
                  "aac",
                  "-b:a",
                  "192k",
                  "-ar",
                  "48000",
                  "-movflags",
                  "+faststart",
                  "-avoid_negative_ts",
                  "make_zero",
                );

              command
                .on("stderr", (line) => {
                  if (debug) {
                    console.log(line);
                  }
                })
                .on("end", () => {
                  const bar = chunkProgress[postIndex];
                  bar.update(100, {
                    filename: post.title,
                  });
                  bar.stop();

                  resolve({
                    ...post,
                    outputPath,
                  });
                })
                .on("progress", (progress) => {
                  if (progress.percent) {
                    const bar = chunkProgress[postIndex];
                    bar.update(Math.round(progress.percent), {
                      filename: post.title,
                    });
                  }
                })
                .on("error", (err) => {
                  console.error(
                    `Error normalizing "${post.title}":`,
                    err.message,
                  );
                  const bar = chunkProgress[postIndex];
                  bar.update(100, {
                    filename: post.title,
                  });
                  bar.stop();
                  resolve(null);
                })
                .save(outputPath);
            },
          );

        if (!debug) {
          fs.unlinkSync(textImageOutputPath);
        }

        return normalizedPost;
      }),
    ).then(
      (posts) =>
        posts.filter(
          (post) => post !== null,
        ) as ProcessedRedditVideoPostWithMetadata[],
    );

    multibar.stop();

    normalizedPosts.push(...result);
  }

  return normalizedPosts;
}
