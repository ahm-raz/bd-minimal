/**
 * Visual self-review: captures pages at 1440×900 as the founder and as a BD into ./screenshots/.
 *
 *   pnpm screenshots                       # every page, demo logins
 *   pnpm screenshots /my-day /leads        # only these paths
 *
 * Env: BASE_URL (default http://localhost:3000), FOUNDER_EMAIL, BD_EMAIL, SCREENSHOT_PASSWORD.
 * Defaults match `pnpm seed:demo`.
 */
import { chromium, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SCREENSHOT_PASSWORD ?? "demo-password-123";
const FOUNDER = process.env.FOUNDER_EMAIL ?? "zain@example.com";
const BD = process.env.BD_EMAIL ?? "ahmed@example.com";
const OUT = path.resolve(process.cwd(), "screenshots");

const PUBLIC_PAGES = ["/login", "/reset-password", "/dev/ui"];
const FOUNDER_PAGES = ["/my-day", "/leads", "/pipeline", "/tasks", "/feed", "/performance", "/team", "/settings", "/profile"];
const BD_PAGES = ["/my-day", "/leads", "/pipeline", "/tasks", "/performance", "/profile"];

function slug(p: string) {
  return p.replace(/^\//, "").replace(/[/?&=]+/g, "-") || "home";
}

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/my-day/, { timeout: 30_000 });
}

async function capture(page: Page, route: string, file: string) {
  await page.goto(`${BASE_URL}${route}`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  console.log(`saved ${file}`);
}

async function main() {
  const only = process.argv.slice(2).filter((a) => a.startsWith("/"));
  const pick = (list: string[]) => (only.length ? list.filter((p) => only.some((o) => p === o || o.startsWith(`${p}/`) || p.startsWith(o))) : list);
  const extra = only.filter((o) => ![...PUBLIC_PAGES, ...FOUNDER_PAGES, ...BD_PAGES].includes(o));

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    const anon = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const p of pick(PUBLIC_PAGES)) await capture(anon, p, `public-${slug(p)}.png`);
    await anon.close();

    for (const [role, email, pages] of [
      ["founder", FOUNDER, FOUNDER_PAGES],
      ["bd", BD, BD_PAGES],
    ] as const) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      try {
        await signIn(page, email);
      } catch {
        console.warn(`Could not sign in as ${email}. Run pnpm seed:demo or set ${role.toUpperCase()}_EMAIL.`);
        await ctx.close();
        continue;
      }
      for (const p of [...pick([...pages]), ...extra]) await capture(page, p, `${role}-${slug(p)}.png`);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
