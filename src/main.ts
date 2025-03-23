import * as dotenv from "dotenv";

dotenv.config();

import * as path from "path";
import { program } from "commander";

import { exit } from "process";
import { concatenateWithTransitions } from "./lib/concatenate";
import { normalizeVideos } from "./lib/normalize";
import { fetchVideoPosts } from "./lib/fetch-post";
import { processRedditPosts } from "./lib/process-posts";

program
  .requiredOption(
    "-s, --subreddit <subreddit>",
    "Subreddit to fetch posts from",
  )
  .option("-c, --count <number>", "Number of posts to process", "10");

program.parse(process.argv);

const options = program.opts();
const subreddit: string = options.subreddit;
const targetVideoCount: number = parseInt(options.count, 10);

(async () => {
  const videos = await fetchVideoPosts(subreddit, targetVideoCount);
  const processedPosts = await processRedditPosts(videos);
  const processedPostsWithMetadata = await normalizeVideos(processedPosts);

  await concatenateWithTransitions(
    processedPostsWithMetadata,
    path.join("output", `${subreddit}_compilation.mp4`),
  );

  exit(0);
})();
