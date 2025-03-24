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
): Promise<ProcessedRedditVideoPost[]> {
  const token = await getAccessToken();
  const videoPosts: ProcessedRedditVideoPost[] = [];
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

  try {
    while (videoPosts.length < targetVideoCount) {
      const timeRangeLog = timeRange ? ` et t=${timeRange}` : "";

      const queryLog = query ? ` avec q=${query}` : "";

      const sbOrUser = subredditOrUser
        ? ` de ${isUserMode ? "u" : "r"}/${subredditOrUser}`
        : "";

      console.log(
        `Récupération des posts vidéo${sbOrUser} avec o=${sortingOrder}${timeRangeLog}${queryLog}...`,
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
        if (post.data.pinned) {
          console.log("Post épinglé, ignoré.");
          continue;
        }

        const video = post.data.media?.reddit_video;

        let foundPost: RedditVideoPost | null = null;

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
            console.log(
              `Impossible de récupérer l'URL de la vidéo pour le post "${post.data.title}"`,
            );
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
          const processedPost = await downloadRedditPostVideo(
            foundPost,
            videoPosts.map((post) => post.outputPath),
            debug,
          );

          if (processedPost) {
            console.log(
              `${index + 1}/${targetVideoCount}:`,
              processedPost.postUrl,
            );
            videoPosts.push(processedPost);
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
