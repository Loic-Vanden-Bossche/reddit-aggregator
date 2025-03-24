import {
  ProcessedRedditVideoPostWithMetadata,
  VideoComplianceOptions,
} from "./types";
import { isDuplicateVideo } from "./duplicate";
import {
  findVideoDimensions,
  getVideoDuration,
  hasAudioStream,
} from "./video-metadata";

export async function checkVideoCompliance(
  post: ProcessedRedditVideoPostWithMetadata,
  videoComplianceOptions: VideoComplianceOptions,
  otherVideoPaths: string[],
): Promise<string[]> {
  const reasons: string[] = [];
  const { outputPath } = post;

  const {
    skipDuplicates,
    maxDuration,
    minResolution,
    minDuration,
    skipNoAudio,
    verticalOrientation,
    horizontalOrientation,
  } = videoComplianceOptions;

  const hasAudio = hasAudioStream(post);
  const videoDimensions = findVideoDimensions(post);
  const videoDuration = getVideoDuration(post);

  if (maxDuration) {
    if (videoDuration > maxDuration) {
      reasons.push("Video is too long");
    }
  }

  if (minDuration) {
    if (videoDuration < minDuration) {
      reasons.push("Video is too short");
    }
  }

  if (minResolution) {
    if (!videoDimensions) {
      reasons.push("Could not find video dimensions");
    } else if (videoDimensions.width * videoDimensions.height < minResolution) {
      reasons.push("Video resolution is too low");
    }
  }

  if (skipNoAudio && !hasAudio) {
    reasons.push("Video has no audio");
  }

  if (verticalOrientation && videoDimensions) {
    if (videoDimensions.width > videoDimensions.height) {
      reasons.push("Video is not vertical");
    }
  }

  if (horizontalOrientation && videoDimensions) {
    if (videoDimensions.width < videoDimensions.height) {
      reasons.push("Video is not horizontal");
    }
  }

  if (skipDuplicates && reasons.length === 0) {
    const isDuplicate = await isDuplicateVideo(outputPath, otherVideoPaths, 10);

    if (isDuplicate) {
      reasons.push("Video is a duplicate");
    }
  }

  return reasons;
}
