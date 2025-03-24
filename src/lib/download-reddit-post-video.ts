import { RedditVideoPost } from "./types";
import path from "path";
import { createDirectoryIfNotExists, downloadFile } from "./utils";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";

export async function downloadRedditPostVideo(
  post: RedditVideoPost,
  debug = false,
  verbose = false,
) {
  // Création du dossier du subreddit
  const subredditDir = path.join("cache");
  createDirectoryIfNotExists(subredditDir);

  const videoOutputPath = path.join(subredditDir, `${post.id}.mp4`);
  try {
    if (!fs.existsSync(videoOutputPath)) {
      if (post.isHlsUrl) {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(post.videoUrl)
            .outputOptions("-c", "copy", "-bsf:a", "aac_adtstoasc")
            .on("stderr", (line) => {
              if (debug) {
                console.log(line);
              }
            })
            .on("end", () => {
              resolve();
            })
            .on("error", (err) => {
              console.error("\nError during HLS download:", err.message);
              reject(err);
            })
            .save(videoOutputPath);
        });
      } else if (post.isGif) {
        const gifPath = videoOutputPath.replace(".mp4", ".gif");
        await downloadFile(post.videoUrl, gifPath);

        await new Promise<void>((resolve, reject) => {
          ffmpeg(gifPath)
            .outputOptions(
              "-c:v",
              "libx264",
              "-preset",
              "ultrafast",
              "-movflags",
              "+faststart",
            )
            .on("stderr", (line) => {
              if (debug) {
                console.log(line);
              }
            })
            .on("end", () => {
              resolve();
            })
            .on("error", (err) => {
              console.error("\nFFmpeg error:", err.message);
              reject(err);
            })
            .save(videoOutputPath);
        });

        fs.unlinkSync(gifPath);
      } else {
        await downloadFile(post.videoUrl, videoOutputPath);
      }
    }

    return {
      ...post,
      outputPath: videoOutputPath,
    };
  } catch (err: Error | any) {
    if (verbose) {
      console.error(
        `\nErreur lors du traitement de la vidéo ${post.id}\n"${post.title}"\n${post.postUrl}\n${post.videoUrl}\n${err.message}\n`,
      );
    }

    // Suppression du fichier en cas d'erreur
    try {
      fs.unlinkSync(videoOutputPath);
    } catch (_) {
      console.error(
        "\nErreur lors de la suppression du fichier:",
        videoOutputPath,
      );
    }
    return null;
  }
}
