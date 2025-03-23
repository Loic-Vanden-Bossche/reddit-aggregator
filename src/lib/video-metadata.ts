import { ffprobe, FfprobeData } from "fluent-ffmpeg";
import {
  ProcessedRedditVideoPost,
  ProcessedRedditVideoPostWithMetadata,
} from "./types";

export async function hasAudioStream(
  post: ProcessedRedditVideoPostWithMetadata,
): Promise<boolean> {
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
  const widestVideo = await findWidestVideo(posts);

  const width = Math.min(1920, widestVideo);
  const height = Math.round(width / widestAspectRatio);

  return { width, height };
}

async function findWidestAspectRatio(
  posts: ProcessedRedditVideoPostWithMetadata[],
): Promise<number> {
  return posts.reduce((acc, post) => {
    const video = post.metadata.streams.find(
      (stream: any) => stream.codec_type === "video",
    );

    if (!video) {
      return acc;
    }

    const { width, height } = video;

    if (!width || !height) {
      return acc;
    }

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
