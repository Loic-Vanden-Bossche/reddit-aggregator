import {
  ProcessedRedditVideoPost,
  ProcessedRedditVideoPostWithMetadata,
} from "./types";
import ffmpeg from "fluent-ffmpeg";
import {
  attachFfmpegMetadata,
  findFinalResolution,
  hasAudioStream,
} from "./video-metadata";
import { createTextImage } from "./text-to-image";
import fs from "fs";

export async function normalizeVideos(
  posts: ProcessedRedditVideoPost[],
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

  return Promise.all(
    postsWithMetadata.map(async (post) => {
      const inputPath = post.outputPath;
      const outputPath = inputPath.replace(/\.mp4$/, "_normalized.mp4");
      const hasAudio = await hasAudioStream(post);

      const textImageOutputPath = inputPath.replace(/\.mp4$/, "_text.png");

      createTextImage(post.title, textImageOutputPath);

      const normalizedPost =
        await new Promise<ProcessedRedditVideoPostWithMetadata | null>(
          (resolve) => {
            const command = ffmpeg(inputPath).input(textImageOutputPath); // Overlay image input

            if (!hasAudio) {
              bypass(command);
              console.log(
                `No audio found in "${post.title}", adding silent audio.`,
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
                  // // Apply padding
                  {
                    filter: "pad",
                    options: {
                      w: width,
                      h: height,
                      x: "(ow-iw)/2",
                      y: "(oh-ih)/2",
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
              .on("start", () => {
                console.log(`Normalizing: ${post.title}`);
              })
              .on("end", () => {
                resolve({
                  ...post,
                  outputPath,
                });
              })
              .on("stderr", (stderrLine) => {
                console.log(stderrLine);
              })
              .on("progress", (progress) => {
                if (progress.percent) {
                  console.log(
                    `Normalizing: ${Math.round(progress.percent)}% done`,
                  );
                }
              })
              .on("error", (err) => {
                console.error(
                  `Error normalizing "${post.title}":`,
                  err.message,
                );
                resolve(null);
              })
              .save(outputPath);
          },
        );

      fs.unlinkSync(inputPath);

      return normalizedPost;
    }),
  ).then(
    (posts) =>
      posts.filter(
        (post) => post !== null,
      ) as ProcessedRedditVideoPostWithMetadata[],
  );
}
