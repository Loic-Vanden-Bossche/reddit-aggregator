import fs from "fs";
import axios from "axios";
import path from "path";
import { RedditFetchOptions } from "./types";

export function createDirectoryIfNotExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export async function downloadFile(
  url: string,
  outputPath: string,
): Promise<void> {
  const writer = fs.createWriteStream(outputPath);
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", (err) => {
      writer.close();
      writer.destroy();
      reject(err);
    });
  });
}

export function chunkArray<T>(array: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, index) =>
    array.slice(index * size, index * size + size),
  );
}

function toSnakeCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2") // Handle camelCase → snake_case
    .replace(/[\s\-]+/g, "_") // Replace spaces and dashes with underscores
    .replace(/__+/g, "_") // Collapse multiple underscores
    .toLowerCase()
    .trim();
}

function getAvailableFilePath(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return filePath;
  }

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  let counter = 1;
  let newPath = path.join(dir, `${baseName}_${counter}${ext}`);

  while (fs.existsSync(newPath)) {
    counter++;
    newPath = path.join(dir, `${baseName}_${counter}${ext}`);
  }

  return newPath;
}

export function getFilePathFromFetchOptions(
  options: RedditFetchOptions,
): string {
  const base = toSnakeCase(options.subredditOrUser ?? "search");
  const sorting = options.sortingOrder;
  const time = options.timeRange ? `_${options.timeRange}` : "";
  const query = options.query ? `_${toSnakeCase(options.query)}` : "";
  const count = `_[${options.targetVideoCount}]`;

  const fileName = `${base}_${sorting}${time}${query}${count}.mp4`;
  const filePath = path.join("output", base, fileName);

  return getAvailableFilePath(filePath);
}
