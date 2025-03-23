import {
  ProcessedRedditVideoPost,
  RedditFetchOptions,
  RedditResponse,
  RedditVideoPost,
  SortingOrder,
  TimeRange,
} from "./types";
import { getAccessToken } from "./auth";
import axios from "axios";
import { downloadRedditPostVideo } from "./download-reddit-post-video";

const { USER_AGENT } = process.env as { [key: string]: string };

function constructRedditUrl(fetchOptions: RedditFetchOptions) {
  const { subredditOrUser, isUserMode, sortingOrder, timeRange } = fetchOptions;

  const useTimeRange = timeRange !== undefined;

  const query = isUserMode
    ? `user/${subredditOrUser}/overview`
    : `r/${subredditOrUser}/${sortingOrder}`;

  return {
    url: `https://oauth.reddit.com/${query}`,
    params: {
      t: useTimeRange ? timeRange : undefined,
      sort: isUserMode ? sortingOrder : undefined,
    },
  };
}

export async function fetchVideoPosts(
  fetchOptions: RedditFetchOptions,
  debug = false,
): Promise<ProcessedRedditVideoPost[]> {
  const token = await getAccessToken();
  const videoPosts: ProcessedRedditVideoPost[] = [];
  let after: string | null = null;
  const limit = 50; // Nombre maximum de posts par requête
  const rateLimitPerMinute = 100; // Limite de requêtes par minute
  const requestInterval = 60000 / rateLimitPerMinute; // Intervalle entre les requêtes en ms

  const { targetVideoCount, subredditOrUser, isUserMode } = fetchOptions;

  let index = 0;
  try {
    while (videoPosts.length < fetchOptions.targetVideoCount) {
      const timeRangeLog = fetchOptions.timeRange
        ? ` et t=${fetchOptions.timeRange}`
        : "";

      const sbOrUser = `${isUserMode ? "u" : "r"}/${fetchOptions.subredditOrUser}`;

      console.log(
        `Récupération des posts vidéo de ${sbOrUser} avec o=${fetchOptions.sortingOrder}${timeRangeLog}...`,
      );

      const { url, params } = constructRedditUrl(fetchOptions);

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
        const video = post.data.media?.reddit_video;
        if (post.data.is_video && video?.hls_url) {
          const processedPost = await downloadRedditPostVideo(
            {
              index,
              id: post.data.id,
              title: post.data.title,
              author: post.data.author,
              videoUrl: video.hls_url,
              isHlsUrl: true,
              postUrl: `https://reddit.com${post.data.permalink}`,
              provider: "reddit",
              subredditOrUser,
            },
            debug,
          );

          if (processedPost) {
            console.log("Post url:", processedPost.postUrl);
            videoPosts.push(processedPost);
          } else {
            console.log(
              `Erreur lors du traitement du post "${post.data.title}"`,
            );

            continue;
          }

          index++;

          if (videoPosts.length >= targetVideoCount) {
            break;
          }
        } else if (post.data.media?.type === "redgifs.com") {
          const url = extractVideoUrlFromRedgifs(
            post.data.media.oembed.thumbnail_url,
          );

          if (!url) {
            console.log(
              `Impossible de récupérer l'URL de la vidéo pour le post "${post.data.title}"`,
            );
            continue;
          }

          const processedPost = await downloadRedditPostVideo(
            {
              index,
              id: post.data.id,
              title: post.data.title,
              author: post.data.author,
              videoUrl: url,
              isHlsUrl: false,
              postUrl: `https://reddit.com${post.data.permalink}`,
              provider: "redgifs",
              subredditOrUser,
            },
            debug,
          );

          if (processedPost) {
            console.log("Post url:", processedPost.postUrl);
            videoPosts.push(processedPost);
          } else {
            console.log(
              `Erreur lors du traitement du post "${post.data.title}"`,
            );
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
        console.log("Plus de posts disponibles.");
        break;
      }

      // Attendre avant la prochaine requête pour respecter la limite de taux
      await new Promise((resolve) => setTimeout(resolve, requestInterval));
    }
  } catch (error: Error | any) {
    console.error(
      "Erreur lors de la récupération des posts vidéo:",
      error?.message,
    );
  }

  return videoPosts;
}

function extractVideoUrlFromRedgifs(url: string) {
  const match = url.match(/\/([^/]+)-poster\.jpg$/);
  const result = match ? match[1] : null;

  return result ? `https://media.redgifs.com/${result}.mp4` : null;
}
