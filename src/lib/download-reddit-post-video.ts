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
  const subredditDir = path.join("output", post.subredditOrUser);
  createDirectoryIfNotExists(subredditDir);

  // Nom du fichier basé sur le titre
  const sanitizedTitle = `${post.index}_${post.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  const videoOutputPath = path.join(subredditDir, `${sanitizedTitle}.mp4`);

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
    fs.unlinkSync(videoOutputPath);
    return null;
  }
}
