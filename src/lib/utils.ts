import fs from "fs";
import axios from "axios";

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
