import { ProcessedRedditVideoPost, RedditVideoPost } from "./types";
import path from "path";
import { createDirectoryIfNotExists, downloadFile } from "./utils";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";

export async function downloadRedditPostVideo(post: RedditVideoPost) {
  try {
    // Création du dossier du subreddit
    const subredditDir = path.join("output", post.subreddit);
    createDirectoryIfNotExists(subredditDir);

    // Nom du fichier basé sur le titre
    const sanitizedTitle = `${post.index}_${post.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    const videoOutputPath = path.join(subredditDir, `${sanitizedTitle}.mp4`);

    // Téléchargement du fichier vidéo
    const videoTempPath = path.join(
      subredditDir,
      `${sanitizedTitle}_video.mp4`,
    );

    await downloadFile(post.videoUrl, videoTempPath);

    if (post.audioUrl) {
      // Téléchargement du fichier audio
      const audioTempPath = path.join(
        subredditDir,
        `${sanitizedTitle}_audio.mp4`,
      );
      await downloadFile(post.audioUrl, audioTempPath);

      // Fusion vidéo et audio avec ffmpeg
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(videoTempPath)
          .input(audioTempPath)
          .outputOptions("-c:v copy", "-c:a aac", "-strict experimental")
          .on("progress", (progress) => {
            console.log(`Processing: ${progress.percent}% done`);
          })
          .on("end", resolve)
          .on("error", reject)
          .save(videoOutputPath);
      });

      // Suppression des fichiers temporaires
      fs.unlinkSync(videoTempPath);
      fs.unlinkSync(audioTempPath);
    } else {
      // Si pas d'audio, renommer simplement le fichier vidéo
      fs.renameSync(videoTempPath, videoOutputPath);
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
