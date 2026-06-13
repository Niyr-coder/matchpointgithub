/**
 * Regenera PNGs PWA / apple-touch desde public/icons/matchpoint-icon.svg.
 *
 *   npx tsx scripts/generate-app-icons.ts
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "public", "icons", "matchpoint-icon.svg");
const OUT_DIR = path.join(ROOT, "public", "icons");
const APP_DIR = path.join(ROOT, "src", "app");

const BG = "#0a0a0a";

async function renderSquare(size: number, outName: string) {
  const svg = await fs.readFile(SRC);
  const buf = await sharp(svg, { density: 256 })
    .resize(size, size, { fit: "contain", background: BG })
    .png()
    .toBuffer();
  await fs.writeFile(path.join(OUT_DIR, outName), buf);
  console.log(`✓ ${outName} (${size}×${size})`);
  return buf;
}

/** Maskable: logo al ~72% para zona segura Android (círculo/squircle). */
async function renderMaskable(size: number, outName: string) {
  const svg = await fs.readFile(SRC);
  const inner = Math.round(size * 0.72);
  const logo = await sharp(svg, { density: 256 })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const buf = await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toBuffer();
  await fs.writeFile(path.join(OUT_DIR, outName), buf);
  console.log(`✓ ${outName} (${size}×${size}, maskable)`);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(APP_DIR, { recursive: true });

  await renderSquare(180, "apple-touch-icon.png");
  await renderSquare(192, "matchpoint-icon-192.png");
  await renderSquare(512, "matchpoint-icon-512.png");
  await renderMaskable(512, "matchpoint-icon-maskable-512.png");

  const apple = await fs.readFile(path.join(OUT_DIR, "apple-touch-icon.png"));
  await fs.writeFile(path.join(APP_DIR, "apple-icon.png"), apple);
  await fs.copyFile(SRC, path.join(APP_DIR, "icon.svg"));
  console.log("✓ src/app/apple-icon.png + icon.svg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
