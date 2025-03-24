import { ProcessedRedditVideoPostWithMetadata } from "./types";
import { isDuplicateVideo } from "./duplicate";
import fs from "fs";

export async function checkVideoCompliance(
  post: ProcessedRedditVideoPostWithMetadata,
  otherVideoPaths: string[],
): Promise<string | null> {
  const { outputPath } = post;

  const isDuplicate = await isDuplicateVideo(outputPath, otherVideoPaths, 10);

  if (isDuplicate) {
    // Suppression du fichier dupliqué
    fs.unlinkSync(outputPath);
    return "Duplicate video";
  }

  return null;
}
