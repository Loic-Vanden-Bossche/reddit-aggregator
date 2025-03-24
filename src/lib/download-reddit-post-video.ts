import { RedditVideoPost } from "./types";
import path from "path";
import { createDirectoryIfNotExists, downloadFile } from "./utils";
import ffmpeg from "fluent-ffmpeg";
import { isDuplicateVideo } from "./duplicate";
import fs from "fs";

export async function downloadRedditPostVideo(
  post: RedditVideoPost,
  otherVideoPaths: string[],
  debug = false,
) {
  // Création du dossier du subreddit
  const subredditDir = path.join("cache");
  createDirectoryIfNotExists(subredditDir);

  const videoOutputPath = path.join(subredditDir, `${post.id}.mp4`);

  if (fs.existsSync(videoOutputPath)) {
    return {
      ...post,
      outputPath: videoOutputPath,
    };
  }

  try {
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
          .on("progress", (progress) => {
            if (progress.percent) {
              console.log(`Progress: ${Math.round(progress.percent)}%`);
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

    const isDuplicate = await isDuplicateVideo(
      videoOutputPath,
      otherVideoPaths,
      10,
    );

    if (isDuplicate) {
      console.log(`\nDuplicate video detected: ${post.title}`);

      // Suppression du fichier dupliqué
      fs.unlinkSync(videoOutputPath);
      return null;
    }

    return {
      ...post,
      outputPath: videoOutputPath,
    };
  } catch (_) {
    console.error(
      `\nErreur lors du traitement de la vidéo "${post.title}"`,
      post.postUrl,
      post.videoUrl,
    );

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
