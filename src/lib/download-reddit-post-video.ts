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
          .on("start", () =>
            console.log("Downloading HLS video with ffmpeg..."),
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
            console.error("Error during HLS download:", err.message);
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
          .on("start", () => {
            console.log("Fast GIF-to-MP4 conversion started...");
          })
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
            console.log("Conversion finished.");
            resolve();
          })
          .on("error", (err) => {
            console.error("FFmpeg error:", err.message);
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
      console.log(`Duplicate video detected: ${post.title}`);

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
      `Erreur lors du traitement de la vidéo "${post.title}"`,
      post.postUrl,
      post.videoUrl,
    );

    // Suppression du fichier en cas d'erreur
    try {
      fs.unlinkSync(videoOutputPath);
    } catch (_) {
      console.error(
        "Erreur lors de la suppression du fichier:",
        videoOutputPath,
      );
    }
    return null;
  }
}
