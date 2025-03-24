import { ffprobe, FfprobeData } from "fluent-ffmpeg";
import {
  ProcessedRedditVideoPost,
  ProcessedRedditVideoPostWithMetadata,
} from "./types";

export function hasAudioStream(
  post: ProcessedRedditVideoPostWithMetadata,
): boolean {
  return post.metadata.streams.some(
    (stream: any) => stream.codec_type === "audio",
  );
}

export async function attachFfmpegMetadata(
  post: ProcessedRedditVideoPost,
): Promise<ProcessedRedditVideoPostWithMetadata> {
  const metadata: FfprobeData = await new Promise((resolve, reject) => {
    ffprobe(post.outputPath, (err, info) => {
      if (err) {
        reject(err);
      } else {
        resolve(info);
      }
    });
  });

  return {
    ...post,
    metadata,
  };
}

export function getVideoDuration(
  post: ProcessedRedditVideoPostWithMetadata,
): number {
  return post.metadata.format?.duration ?? 0;
}

export async function findFinalResolution(
  posts: ProcessedRedditVideoPostWithMetadata[],
): Promise<{ width: number; height: number }> {
  const widestAspectRatio = await findWidestAspectRatio(posts);
  const widestVideo = Math.min(await findWidestVideo(posts), 1920);
  const tallestVideo = Math.min(await findTallestVideo(posts), 1080);

  // Try computing height from minWidth based on the aspect ratio
  let width = widestVideo;
  let height = Math.round(width / widestAspectRatio);

  // If computed height is less than required, recalculate width from minHeight
  if (height < tallestVideo) {
    height = tallestVideo;
    width = Math.round(height * widestAspectRatio);
  }

  return { width, height };
}

export function findVideoDimensions(
  post: ProcessedRedditVideoPostWithMetadata,
): { width: number; height: number } | null {
  const video = post.metadata.streams.find(
    (stream: any) => stream.codec_type === "video",
  );

  if (!video) {
    return null;
  }

  const { width, height } = video;

  if (!width || !height) {
    return null;
  }

  return { width, height };
}

async function findWidestAspectRatio(
  posts: ProcessedRedditVideoPostWithMetadata[],
): Promise<number> {
  return posts.reduce((acc, post) => {
    const dimensions = findVideoDimensions(post);

    if (!dimensions) {
      return acc;
    }

    const { width, height } = dimensions;

    const aspectRatio = width / height;

    return aspectRatio > acc ? aspectRatio : acc;
  }, 0);
}

async function findWidestVideo(
  posts: ProcessedRedditVideoPostWithMetadata[],
): Promise<number> {
  return posts.reduce((acc, post) => {
    const video = post.metadata.streams.find(
      (stream: any) => stream.codec_type === "video",
    );

    if (!video) {
      return acc;
    }

    const { width } = video;

    if (!width) {
      return acc;
    }

    return width > acc ? width : acc;
  }, 0);
}

async function findTallestVideo(
  posts: ProcessedRedditVideoPostWithMetadata[],
): Promise<number> {
  return posts.reduce((acc, post) => {
    const video = post.metadata.streams.find(
      (stream: any) => stream.codec_type === "video",
    );

    if (!video) {
      return acc;
    }

    const { height } = video;

    if (!height) {
      return acc;
    }

    return height > acc ? height : acc;
  }, 0);
}
