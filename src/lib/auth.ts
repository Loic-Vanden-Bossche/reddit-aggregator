import axios from "axios";

const {
  REDDIT_CLIENT_ID,
  REDDIT_CLIENT_SECRET,
  REDDIT_USERNAME,
  REDDIT_PASSWORD,
  USER_AGENT,
} = process.env as { [key: string]: string };

export async function getAccessToken(): Promise<string> {
  const response = await axios.post(
    "https://www.reddit.com/api/v1/access_token",
    new URLSearchParams({
      grant_type: "password",
      username: REDDIT_USERNAME,
      password: REDDIT_PASSWORD,
    }),
    {
      auth: {
        username: REDDIT_CLIENT_ID,
        password: REDDIT_CLIENT_SECRET,
      },
      headers: {
        "User-Agent": USER_AGENT,
      },
    },
  );

  return response.data.access_token;
}
