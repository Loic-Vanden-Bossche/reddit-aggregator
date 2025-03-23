import { createCanvas, GlobalFonts, SKRSContext2D } from "@napi-rs/canvas";
import { writeFileSync } from "fs";
import { join } from "path";

// Register fonts
GlobalFonts.registerFromPath(join("assets", "font.ttf"), "font");
GlobalFonts.registerFromPath(join("assets", "emoji-font.ttf"), "font2");

export function createTextImage(
  text: string,
  outputPath: string,
  subtext?: string,
) {
  const maxFontSize = 48;
  const minFontSize = 20;
  const subtextFontScale = 0.6; // 60% of main font size
  const lineHeightFactor = 1.2;
  const paddingX = 40;
  const paddingY = 30;
  const borderRadius = 25;
  const maxWidth = 1000;

  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");

  let fontSize = maxFontSize;
  let mainLines: string[] = [];
  let subLines: string[] = [];
  let mainTextWidth = 0;
  let subtextWidth = 0;

  const wrapText = (
    ctx: SKRSContext2D,
    text: string,
    maxWidth: number,
  ): string[] => {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const { width } = ctx.measureText(testLine);
      if (width < maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  };

  // Adjust font size until everything fits
  while (fontSize >= minFontSize) {
    tempCtx.font = `${fontSize}px "font", "font2"`;
    mainLines = wrapText(tempCtx, text, maxWidth - 2 * paddingX);
    const mainLineWidths = mainLines.map(
      (line) => tempCtx.measureText(line).width,
    );
    mainTextWidth = Math.max(...mainLineWidths);

    if (subtext) {
      const subFontSize = fontSize * subtextFontScale;
      tempCtx.font = `${subFontSize}px "font", "font2"`;
      subLines = wrapText(tempCtx, subtext, maxWidth - 2 * paddingX);
      const subLineWidths = subLines.map(
        (line) => tempCtx.measureText(line).width,
      );
      subtextWidth = Math.max(...subLineWidths);
    }

    const totalWidth = Math.max(mainTextWidth, subtextWidth) + 2 * paddingX;
    if (totalWidth <= maxWidth || fontSize === minFontSize) break;

    fontSize -= 2;
  }

  const mainLineHeight = fontSize * lineHeightFactor;
  const subFontSize = fontSize * subtextFontScale;
  const subLineHeight = subFontSize * lineHeightFactor;

  const totalTextHeight =
    mainLines.length * mainLineHeight +
    (subtext ? subLines.length * subLineHeight + subLineHeight * 0.5 : 0); // spacing between main and subtext

  const canvasWidth = Math.max(mainTextWidth, subtextWidth) + 2 * paddingX;
  const canvasHeight = totalTextHeight + 2 * paddingY;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Draw background with rounded corners
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  drawRoundedRect(ctx, 0, 0, canvasWidth, canvasHeight, borderRadius);
  ctx.fill();

  // Draw main text
  ctx.font = `${fontSize}px "font", "font2"`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let y = paddingY + mainLineHeight / 2;
  for (const line of mainLines) {
    ctx.fillText(line, canvasWidth / 2, y);
    y += mainLineHeight;
  }

  // Draw subtext
  if (subtext) {
    ctx.font = `${subFontSize}px "font", "font2"`;
    for (const line of subLines) {
      ctx.fillText(line, canvasWidth / 2, y);
      y += subLineHeight;
    }
  }

  // Save the image
  const buffer = canvas.toBuffer("image/png");
  writeFileSync(outputPath, buffer);
}

// Rounded rectangle helper
function drawRoundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
