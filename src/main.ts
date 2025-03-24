import * as dotenv from "dotenv";
import { program } from "commander";

dotenv.config();

import { exit } from "process";
import { concatenateWithTransitions } from "./lib/concatenate";
import { normalizeVideos } from "./lib/normalize";
import { fetchVideoPosts } from "./lib/fetch-post";
import { RedditFetchOptions, SortingOrder, TimeRange } from "./lib/types";
import { getFilePathFromFetchOptions } from "./lib/utils";

program
  .option("-s, --subreddit <subreddit>", "Subreddit to fetch posts from")
  .option("-u, --user <user>", "User to fetch posts from")
  .option("-o, --sorting-order <order>", "Sorting order", "hot")
  .option("-t, --time-range <range>", "Time range")
  .option("-c, --count <number>", "Number of posts to process", "10")
  .option("-q, --query <query>", "Query to search for")
  .option("-d, --debug", "Output extra debugging", false);

program.parse(process.argv);

const options = program.opts();

const subreddit: string = options.subreddit;
const user: string = options.user;
const query = options.query;

if ((subreddit && user) || (!subreddit && !user)) {
  if (!subreddit && !query) {
    console.error(
      "Error: You must provide either --subreddit or --user, but not both.",
    );
    process.exit(1);
  }
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

if (query) {
  if (isUserMode) {
    console.error("Error: Query is only available for subreddit mode.");
    process.exit(1);
  }

  const queryNotCompatibleSortingOrders = [
    SortingOrder.Rising,
    SortingOrder.Controversial,
    SortingOrder.Best,
  ];

  if (queryNotCompatibleSortingOrders.includes(sortingOrder)) {
    console.error(
      `Error: Query is not compatible with the selected sorting order. (${Object.values(sortingOrder).join(", ")})`,
    );
    process.exit(1);
  }
} else {
  const onlyQueryCompatibleSortingOrders = [
    SortingOrder.Relevance,
    SortingOrder.Comments,
  ];

  if (onlyQueryCompatibleSortingOrders.includes(sortingOrder)) {
    console.error(
      `Error: Query is required for the selected sorting order. (${Object.values(sortingOrder).join(", ")})`,
    );
    process.exit(1);
  }
}

let timeRange = options.timeRange as TimeRange;

const sortCompatibleTimeRanges = [
  SortingOrder.Top,
  SortingOrder.Controversial,
  SortingOrder.Comments,
  SortingOrder.Relevance,
];

if (!sortCompatibleTimeRanges.includes(sortingOrder)) {
  if (timeRange) {
    console.error(
      `Error: Time range is only available for the following sorting orders: ${sortCompatibleTimeRanges.join(", ")}`,
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

const fetchOptions: RedditFetchOptions = {
  subredditOrUser: subRedditOrUser,
  isUserMode,
  targetVideoCount,
  sortingOrder,
  timeRange,
  query,
};

(async () => {
  const processedPosts = await fetchVideoPosts(fetchOptions, isDebug);
  const processedPostsWithMetadata = await normalizeVideos(
    processedPosts,
    isDebug,
  );

  const { dir, name } = getFilePathFromFetchOptions(fetchOptions);
  await concatenateWithTransitions(
    processedPostsWithMetadata,
    dir,
    name,
    isDebug,
  );

  exit(0);
})();
