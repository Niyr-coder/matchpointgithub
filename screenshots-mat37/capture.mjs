// MAT-37 — before/after de los CTAs primarios y Nav glass.
// Se invoca dos veces: una pre-cambios (`STATE=before`) y otra post (`STATE=after`).
// Capturas: 1440x900 desktop + 390x844 mobile.

import { chromium } from "playwright";
import path from "node:path";

const OUT = path.resolve("./screenshots-mat37");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const STATE = process.env.STATE ?? "after";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, dsf: 1 },
  mobile: { width: 390, height: 844, dsf: 2 },
};

async function go(page, url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(800);
}

async function capture(name, fn) {
  const browser = await chromium.launch();
  try {
    for (const [vp, dims] of Object.entries(VIEWPORTS)) {
      const ctx = await browser.newContext({
        viewport: { width: dims.width, height: dims.height },
        deviceScaleFactor: dims.dsf,
      });
      const page = await ctx.newPage();
      const file = path.join(OUT, `${STATE}-${name}-${vp}.png`);
      await fn(page, vp, file);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

// 1. Landing hero — la mayor superficie con btn-primary visible en primer scroll.
await capture("01-landing-hero", async (page, vp, file) => {
  await go(page, `${BASE}/`);
  await page.screenshot({ path: file, fullPage: false });
  console.log("captured", file);
});

// 2. Nav desktop — sólo desktop, los links inactivos del glass son el caso.
await capture("02-nav-glass", async (page, vp, file) => {
  if (vp !== "desktop") return;
  await go(page, `${BASE}/`);
  const nav = page.locator("nav").first();
  await nav.scrollIntoViewIfNeeded();
  const box = await nav.boundingBox();
  if (box) {
    const pad = 8;
    await page.screenshot({
      path: file,
      clip: {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: Math.min(box.width + pad * 2, page.viewportSize().width - 1),
        height: Math.min(box.height + pad * 2, page.viewportSize().height - 1),
      },
    });
  } else {
    await page.screenshot({ path: file, fullPage: false });
  }
  console.log("captured", file);
});

// 3. /precios cards — donde Lighthouse marcó los 5 nodos.
await capture("03-precios-cards", async (page, vp, file) => {
  await go(page, `${BASE}/precios?tab=clubes`);
  const grid = page.locator(".tier-grid, [data-tier-grid], h2").first();
  await grid.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: file, fullPage: false });
  console.log("captured", file);
});

// 4. btn-primary :hover — apuntamos al primer CTA "Empezar gratis" o equivalente.
await capture("04-btn-hover", async (page, vp, file) => {
  await go(page, `${BASE}/precios?tab=clubes`);
  const btn = page.locator(".btn-primary:visible, .lp-btn-primary:visible").first();
  await btn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await btn.hover({ force: true });
  await page.waitForTimeout(300);
  const box = await btn.boundingBox();
  if (box) {
    const pad = 60;
    await page.screenshot({
      path: file,
      clip: {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: Math.min(box.width + pad * 2, page.viewportSize().width - 1),
        height: Math.min(box.height + pad * 2, page.viewportSize().height - 1),
      },
    });
  } else {
    await page.screenshot({ path: file, fullPage: false });
  }
  console.log("captured", file);
});

console.log("Done.", STATE);
