import * as dotenv from "dotenv";
import * as path from "path";
import { program } from "commander";

dotenv.config();

import { exit } from "process";
import { concatenateWithTransitions } from "./lib/concatenate";
import { normalizeVideos } from "./lib/normalize";
import { fetchVideoPosts } from "./lib/fetch-post";
import { SortingOrder, TimeRange } from "./lib/types";

program
  .option("-s, --subreddit <subreddit>", "Subreddit to fetch posts from")
  .option("-u, --user <user>", "User to fetch posts from")
  .option("-o, --sorting-order <order>", "Sorting order", "hot")
  .option("-t, --time-range <range>", "Time range")
  .option("-c, --count <number>", "Number of posts to process", "10")
  .option("-d, --debug", "Output extra debugging", false);

program.parse(process.argv);

const options = program.opts();

const subreddit: string = options.subreddit;
const user: string = options.user;

if ((subreddit && user) || (!subreddit && !user)) {
  console.error(
    "Error: You must provide either --subreddit or --user, but not both.",
  );
  process.exit(1);
}

if (!Object.values(SortingOrder).includes(options.sortingOrder)) {
  console.log(Object.keys(SortingOrder));
  console.error("Error: Invalid sorting order.");
  process.exit(1);
}

if (
  options.timeRange &&
  !Object.values(TimeRange).includes(options.timeRange)
) {
  console.error("Error: Invalid time range.");
  process.exit(1);
}

const sortingOrder = options.sortingOrder as SortingOrder;
const isUserMode: boolean = user !== undefined;

let timeRange = options.timeRange as TimeRange;

if (
  sortingOrder !== SortingOrder.Top &&
  sortingOrder !== SortingOrder.Controversial
) {
  if (timeRange) {
    console.error(
      "Error: Time range is only available for top and controversial sorting orders.",
    );
    process.exit(1);
  }
} else {
  timeRange = timeRange ?? TimeRange.Month;
}

if (isUserMode && sortingOrder === SortingOrder.Rising) {
  console.error("Error: Rising sorting order is not available for user mode.");
  process.exit(1);
}

const targetVideoCount: number = parseInt(options.count, 10);
const isDebug: boolean = options.debug;

const subRedditOrUser = subreddit ?? user;

const fetchOptions = {
  subredditOrUser: subRedditOrUser,
  isUserMode,
  targetVideoCount,
  sortingOrder,
  timeRange,
};

(async () => {
  const processedPosts = await fetchVideoPosts(fetchOptions, isDebug);
  const processedPostsWithMetadata = await normalizeVideos(
    processedPosts,
    isDebug,
  );

  await concatenateWithTransitions(
    processedPostsWithMetadata,
    path.join("output", `${subRedditOrUser}_compilation.mp4`),
    isDebug,
  );

  exit(0);
})();
