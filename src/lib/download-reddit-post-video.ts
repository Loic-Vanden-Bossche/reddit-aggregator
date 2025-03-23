import { RedditVideoPost } from "./types";
import path from "path";
import { createDirectoryIfNotExists, downloadFile } from "./utils";
import ffmpeg from "fluent-ffmpeg";

export async function downloadRedditPostVideo(
  post: RedditVideoPost,
  debug = false,
) {
  try {
    // Création du dossier du subreddit
    const subredditDir = path.join("output", post.subredditOrUser);
    createDirectoryIfNotExists(subredditDir);

    // Nom du fichier basé sur le titre
    const sanitizedTitle = `${post.index}_${post.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    const videoOutputPath = path.join(subredditDir, `${sanitizedTitle}.mp4`);

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

    return null;
  }
}
