import { FfprobeData } from "fluent-ffmpeg";

export enum SortingOrder {
  Top = "top",
  Hot = "hot",
  New = "new",
  Rising = "rising",
  Best = "best",
  Controversial = "controversial",
  Relevance = "relevance",
  Comments = "comments",
}

export enum TimeRange {
  Hour = "hour",
  Day = "day",
  Week = "week",
  Month = "month",
  Year = "year",
  All = "all",
}

export interface RedditFetchOptions {
  subredditOrUser?: string;
  isUserMode: boolean;
  targetVideoCount: number;
  sortingOrder: SortingOrder;
  timeRange?: TimeRange;
  query?: string;
}

export interface RedditVideoPost {
  index: number;
  id: string;
  title: string;
  author: string;
  videoUrl: string;
  isHlsUrl: boolean;
  isGif: boolean;
  postUrl: string;
  provider: string;
  subredditOrUser: string;
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
              hls_url: string;
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
          pinned: boolean;
        };
      }>;
    };
  };
}
