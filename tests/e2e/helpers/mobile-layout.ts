import { expect, type Page } from "@playwright/test";

export const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

export type LayoutProbe = {
  scrollOverflowPx: number;
  wideElements: Array<{ tag: string; className: string; overflowPx: number }>;
};

/** Detecta desborde horizontal del documento y nodos que sobresalen del viewport. */
export async function probeMobileLayout(page: Page): Promise<LayoutProbe> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const vw = doc.clientWidth;
    const scrollOverflowPx = doc.scrollWidth - vw;

    const wideElements: Array<{ tag: string; className: string; overflowPx: number }> = [];
    const nodes = document.querySelectorAll("main *, main");
    nodes.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      const overflowPx = Math.round(rect.right - vw);
      if (overflowPx > 8) {
        const tag = el.tagName.toLowerCase();
        const className = (el.className && typeof el.className === "string" ? el.className : "")
          .split(/\s+/)
          .slice(0, 4)
          .join(" ");
        wideElements.push({ tag, className, overflowPx });
      }
    });

    wideElements.sort((a, b) => b.overflowPx - a.overflowPx);
    return { scrollOverflowPx, wideElements: wideElements.slice(0, 8) };
  });
}

export async function assertMobileChrome(page: Page) {
  const nav = page.getByRole("navigation", { name: "Navegación rápida" });
  await expect(nav).toBeAttached({ timeout: 15_000 });
  await expect.poll(async () => nav.getAttribute("aria-hidden")).toBe("false");
  await expect(nav).toBeVisible();
}

export async function assertNoHorizontalOverflow(
  page: Page,
  opts?: { maxPx?: number; attachLabel?: string },
) {
  const maxPx = opts?.maxPx ?? 3;
  const probe = await probeMobileLayout(page);
  if (probe.scrollOverflowPx > maxPx && opts?.attachLabel) {
    await page.screenshot({
      path: `tests/e2e/.artifacts/mobile-${opts.attachLabel}-overflow.png`,
      fullPage: true,
    });
  }
  expect(
    probe.scrollOverflowPx,
    `Overflow horizontal ${probe.scrollOverflowPx}px. Nodos: ${JSON.stringify(probe.wideElements.slice(0, 3))}`,
  ).toBeLessThanOrEqual(maxPx);
  return probe;
}
