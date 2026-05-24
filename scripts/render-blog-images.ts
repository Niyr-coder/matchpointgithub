/**
 * Render blog cover SVGs (src/assets/blog-art/*.svg) into raster JPGs under
 * /public/blog and /public/og.
 *
 * Why JPG and not SVG: posts.ts coverImage paths are .jpg, and OG previews
 * (WhatsApp, X, LinkedIn) do not reliably render SVG. The source-of-truth
 * artwork stays as SVG in src/assets/blog-art so we can re-render at any size.
 *
 * Usage: `npx tsx scripts/render-blog-images.ts`
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

type Job = {
  source: string;
  out: string;
  width: number;
  height: number;
};

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src", "assets", "blog-art");
const PUBLIC_BLOG = path.join(ROOT, "public", "blog");
const PUBLIC_OG = path.join(ROOT, "public", "og");

const COVER_SLUGS = [
  "como-armar-un-doble-mixto-sin-pelear",
  "5-clubes-para-jugar-pickleball-en-quito",
  "como-leer-tu-ranking-mejorar-rapido",
  "guia-pago-deuna-clubes-y-jugadores",
  "placeholder-guias",
];

const jobs: Job[] = [
  ...COVER_SLUGS.map((slug) => ({
    source: path.join(SRC_DIR, `${slug}.svg`),
    out: path.join(PUBLIC_BLOG, `${slug}.jpg`),
    width: 1600,
    height: 900,
  })),
  {
    source: path.join(SRC_DIR, "og-blog-index.svg"),
    out: path.join(PUBLIC_OG, "blog-index.jpg"),
    width: 1200,
    height: 630,
  },
  {
    source: path.join(SRC_DIR, "og-blog-default.svg"),
    out: path.join(PUBLIC_OG, "blog-default.jpg"),
    width: 1200,
    height: 630,
  },
];

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

async function render(job: Job) {
  const svg = await fs.readFile(job.source);
  // density 2x → crisp rasterisation of the SVG before resize.
  const buf = await sharp(svg, { density: 192 })
    .resize(job.width, job.height, { fit: "cover" })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
  await fs.writeFile(job.out, buf);
  const kb = (buf.byteLength / 1024).toFixed(1);
  console.log(`✓ ${path.relative(ROOT, job.out)} — ${kb} KB`);
}

async function main() {
  await ensureDir(PUBLIC_BLOG);
  await ensureDir(PUBLIC_OG);
  for (const job of jobs) {
    await render(job);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
