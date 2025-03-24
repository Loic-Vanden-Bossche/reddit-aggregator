import {
  ProcessedRedditVideoPostWithMetadata,
  RedditFetchOptions,
  RedditResponse,
  RedditVideoPost,
} from "./types";
import { getAccessToken } from "./auth";
import axios from "axios";
import { downloadRedditPostVideo } from "./download-reddit-post-video";

import cliProgress from "cli-progress";
import chalk from "chalk";
import { attachFfmpegMetadata } from "./video-metadata";
import { checkVideoCompliance } from "./video-compliance";

const { USER_AGENT } = process.env as { [key: string]: string };

function constructRedditUrl(fetchOptions: RedditFetchOptions) {
  const { subredditOrUser, isUserMode, sortingOrder, timeRange, query } =
    fetchOptions;

  const useTimeRange = timeRange !== undefined;
  const useQuery = query !== undefined;

  const route = isUserMode
    ? `user/${subredditOrUser}/overview`
    : `${subredditOrUser === undefined ? "" : `r/${subredditOrUser}/`}${useQuery ? "search" : sortingOrder}`;

  return {
    url: `https://oauth.reddit.com/${route}`,
    params: {
      t: useTimeRange ? timeRange : undefined,
      sort: isUserMode || useQuery ? sortingOrder : undefined,
      restrict_sr: useQuery ? !!subredditOrUser : undefined,
      q: query,
    },
  };
}

export async function fetchVideoPosts(
  fetchOptions: RedditFetchOptions,
  debug = false,
): Promise<ProcessedRedditVideoPostWithMetadata[]> {
  const token = await getAccessToken();
  const videoPosts: ProcessedRedditVideoPostWithMetadata[] = [];
  let after: string | null = null;
  const limit = 50; // Nombre maximum de posts par requête
  const rateLimitPerMinute = 100; // Limite de requêtes par minute
  const requestInterval = 60000 / rateLimitPerMinute; // Intervalle entre les requêtes en ms

  const {
    targetVideoCount,
    subredditOrUser,
    isUserMode,
    timeRange,
    query,
    sortingOrder,
  } = fetchOptions;

  let index = 0;

  const timeRangeLog = timeRange ? ` et t=${timeRange}` : "";
  const queryLog = query ? ` avec q=${query}` : "";
  const sbOrUser = subredditOrUser
    ? ` de ${isUserMode ? "u" : "r"}/${subredditOrUser}`
    : "";

  console.log(
    `Récupération des posts vidéo${sbOrUser} avec o=${sortingOrder}${timeRangeLog}${queryLog}...`,
  );

  const progressBar = new cliProgress.SingleBar(
    {
      format:
        "Downloading videos |" +
        chalk.cyan("{bar}") +
        "| {percentage}% || {value}/{total} Videos - {title}",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );

  progressBar.start(targetVideoCount, 0, { title: "Starting..." });

  const { url, params } = constructRedditUrl(fetchOptions);

  try {
    while (videoPosts.length < targetVideoCount) {
      const response: RedditResponse = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": USER_AGENT,
        },
        params: {
          ...params,
          limit,
          after,
        },
      });

      const posts = response.data.data.children;

      for (const post of posts) {
        if (post.data.pinned) {
          continue;
        }

        const video = post.data.media?.reddit_video;

        let foundPost: RedditVideoPost | null = null;

        progressBar.update(index + 1, { title: post.data.title });

        if (post.data.is_video && video?.hls_url) {
          foundPost = {
            index,
            id: post.data.id,
            title: post.data.title,
            author: post.data.author,
            videoUrl: video.hls_url,
            isHlsUrl: true,
            isGif: false,
            postUrl: `https://reddit.com${post.data.permalink}`,
            provider: "reddit",
            subredditOrUser: subredditOrUser ?? "search",
          };
        } else if (
          post.data.media?.type === "redgifs.com" ||
          post.data.media?.type === "v3.redgifs.com"
        ) {
          const url = extractVideoUrlFromRedgifs(
            post.data.media.oembed.thumbnail_url,
          );

          if (!url) {
            continue;
          }

          foundPost = {
            index,
            id: post.data.id,
            title: post.data.title,
            author: post.data.author,
            videoUrl: url,
            isHlsUrl: false,
            isGif: false,
            postUrl: `https://reddit.com${post.data.permalink}`,
            provider: "redgifs",
            subredditOrUser: subredditOrUser ?? "search",
          };
        } else if (post.data.url?.endsWith(".gif")) {
          foundPost = {
            index,
            id: post.data.id,
            title: post.data.title,
            author: post.data.author,
            videoUrl: post.data.url,
            isHlsUrl: false,
            isGif: true,
            postUrl: `https://reddit.com${post.data.permalink}`,
            provider: "reddit_gif",
            subredditOrUser: subredditOrUser ?? "search",
          };
        }

        if (foundPost) {
          const processedPost = await downloadRedditPostVideo(foundPost, debug);

          if (processedPost) {
            const postWithMetadata = await attachFfmpegMetadata(processedPost);

            const notCompliantReason = await checkVideoCompliance(
              postWithMetadata,
              videoPosts.map((post) => post.outputPath),
            );

            function logMessage(message: string) {
              // Stop the progress bar temporarily
              progressBar.stop();

              // Log the message
              console.log(message);

              // Resume the progress bar
              progressBar.start(progressBar.getTotal(), index + 1, {
                title: postWithMetadata.title,
              });
            }

            if (notCompliantReason) {
              logMessage(
                `Non compliant video detected: ${postWithMetadata.title} - ${notCompliantReason}`,
              );

              continue;
            }
            videoPosts.push(postWithMetadata);
          } else {
            continue;
          }

          index++;

          if (videoPosts.length >= targetVideoCount) {
            break;
          }
        }
      }

      after = response.data.data.after;

      if (!after) {
        console.log("\nPlus de posts disponibles.");
        break;
      }

      // Attendre avant la prochaine requête pour respecter la limite de taux
      await new Promise((resolve) => setTimeout(resolve, requestInterval));
    }
  } catch (error: Error | any) {
    console.error(
      "\nErreur lors de la récupération des posts vidéo:",
      error?.message,
    );
  }

  progressBar.stop();

  return videoPosts;
}

function extractVideoUrlFromRedgifs(url: string) {
  if (!url) {
    return null;
  }

  const match = url.match(/\/([^/]+)-poster\.jpg$/);
  const result = match ? match[1] : null;

  return result ? `https://media.redgifs.com/${result}.mp4` : null;
}
