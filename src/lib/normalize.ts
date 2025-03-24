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

function displayProgress(progress: number) {
  const barLength = 20;
  const progressChars = Math.round(barLength * (progress / 100));
  const bar = "█".repeat(progressChars).padEnd(barLength, "░");
  process.stdout.write(`\r[${bar}] ${progress.toFixed(2)}%`);
}

function calculateTotalProgress(
  upperProgress: number,
  chunkScaleFactor: number,
  progresses: number[],
) {
  const progressesAverage =
    progresses.reduce((acc, progress) => {
      return acc + progress;
    }, 0) / progresses.length;

  return upperProgress + progressesAverage * chunkScaleFactor;
}

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

  let totalProgress = 0;

  console.log(`Normalizing ${postsWithMetadata.length} videos...`);

  for (const chunk of chunks) {
    // exemple: chunk.length = 10 && postsWithMetadata.length = 100, chunkScaleFactor = 0.1
    const chunkScaleFactor = chunk.length / postsWithMetadata.length;

    // create an array of the length of the number of elment in chunk and fill with 0
    const chunkProgress = Array.from({
      length: chunk.length,
    }).fill(0) as Array<number>;

    const result = await Promise.all(
      chunk.map(async (post, postIndex) => {
        const inputPath = post.outputPath;
        const subredditDir = path.join("output", post.subredditOrUser);

        const outputPath = path.join(subredditDir, `${post.id}_normalized.mp4`);

        const hasAudio = await hasAudioStream(post);

        const textImageOutputPath = inputPath.replace(/\.mp4$/, "_text.png");

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
                console.log(
                  `\nNo audio found in "${post.title}", adding silent audio.`,
                );
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
                  chunkProgress[postIndex] = 100;
                  resolve({
                    ...post,
                    outputPath,
                  });
                })
                .on("progress", (progress) => {
                  if (progress.percent) {
                    chunkProgress[postIndex] = progress.percent;

                    const cProgress = calculateTotalProgress(
                      totalProgress,
                      chunkScaleFactor,
                      chunkProgress,
                    );

                    displayProgress(cProgress);
                  }
                })
                .on("error", (err) => {
                  console.error(
                    `Error normalizing "${post.title}":`,
                    err.message,
                  );
                  chunkProgress[postIndex] = 100;
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

    totalProgress += calculateTotalProgress(
      totalProgress,
      chunkScaleFactor,
      chunkProgress,
    );

    normalizedPosts.push(...result);
  }

  return normalizedPosts;
}
