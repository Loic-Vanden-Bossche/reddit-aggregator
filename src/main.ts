import * as dotenv from "dotenv";

dotenv.config();

import * as path from "path";
import { program } from "commander";

import { exit } from "process";
import { concatenateWithTransitions } from "./lib/concatenate";
import { normalizeVideos } from "./lib/normalize";
import { fetchVideoPosts } from "./lib/fetch-post";

program
  .requiredOption(
    "-s, --subreddit <subreddit>",
    "Subreddit to fetch posts from",
  )
  .option("-c, --count <number>", "Number of posts to process", "10")
  // debug option
  .option("-d, --debug", "output extra debugging", false);

program.parse(process.argv);

const options = program.opts();
const subreddit: string = options.subreddit;
const targetVideoCount: number = parseInt(options.count, 10);
const isDebug: boolean = options.debug;

(async () => {
  const processedPosts = await fetchVideoPosts(
    subreddit,
    targetVideoCount,
    isDebug,
  );
  const processedPostsWithMetadata = await normalizeVideos(
    processedPosts,
    isDebug,
  );

  await concatenateWithTransitions(
    processedPostsWithMetadata,
    path.join("output", `${subreddit}_compilation.mp4`),
    isDebug,
  );

  exit(0);
})();
