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

export function toSnakeCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2") // Handle camelCase → snake_case
    .replace(/[\s\-]+/g, "_") // Replace spaces and dashes with underscores
    .replace(/__+/g, "_") // Collapse multiple underscores
    .toLowerCase()
    .trim();
}

function getAvailableFilePath(filePath: string) {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(filePath)) {
    return { dir, name: path.basename(filePath) };
  }

  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  let counter = 1;
  let newName = `${baseName}_${counter}${ext}`;
  let newPath = path.join(dir, newName);

  while (fs.existsSync(newPath)) {
    counter++;
    newName = `${baseName}_${counter}${ext}`;
    newPath = path.join(dir, newName);
  }

  return { dir, name: newName };
}

function sanitizeFileName(input: string): string {
  return (
    input
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f<>:"/\\|?*\u007F]+/g, "") // Remove invalid characters
      .replace(/\s+/g, "_") // Replace whitespace with underscores
      .replace(/\.+$/, "") // Remove trailing dots
      .replace(/^_+|_+$/g, "") // Trim leading/trailing underscores
      .slice(0, 255) // Limit length (safe max for most FS)
  );
}

export function getFilePathFromFetchOptions(options: RedditFetchOptions) {
  const base = toSnakeCase(options.subredditOrUser ?? "search");
  const sorting = options.sortingOrder;
  const time = options.timeRange ? `_${options.timeRange}` : "";
  const query = options.query ? `_${toSnakeCase(options.query)}` : "";
  const count = `_[${options.targetVideoCount}]`;

  const fileName = sanitizeFileName(
    `${base}_${sorting}${time}${query}${count}.mp4`,
  );
  const filePath = path.join("output", base, fileName);

  return getAvailableFilePath(filePath);
}
