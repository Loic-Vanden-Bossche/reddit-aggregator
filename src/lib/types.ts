import { FfprobeData } from "fluent-ffmpeg";

export interface RedditVideoPost {
  index: number;
  id: string;
  title: string;
  author: string;
  audioUrl: string | null;
  videoUrl: string;
  postUrl: string;
  provider: string;
  subreddit: string;
}

export interface ProcessedRedditVideoPost extends RedditVideoPost {
  outputPath: string;
}

export interface ProcessedRedditVideoPostWithMetadata
  extends ProcessedRedditVideoPost {
  metadata: FfprobeData;
}

export interface RedditResponse {
  data: {
    data: {
      after: string | null;
      children: Array<{
        data: {
          id: string;
          title: string;
          media: {
            reddit_video: {
              fallback_url: string;
              has_audio: boolean;
            };
            type: string;
            oembed: {
              thumbnail_url: string;
            };
          };
          is_video: boolean;
          url: string;
          author: string;
          permalink: string;
        };
      }>;
    };
  };
}
