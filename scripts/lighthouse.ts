/**
 * Lighthouse accessibility scores for My Day, Leads and Performance (docs/08, M9).
 *
 *   pnpm build && pnpm start -p 3100        # in another terminal
 *   BASE_URL=http://localhost:3100 pnpm lighthouse
 *
 * Opens Chrome with Playwright (persistent profile + remote debugging port), signs in there, then
 * runs the Lighthouse CLI (via pnpm dlx, not a dependency) against that same browser with --port,
 * so the session never leaves the browser. Reports go to ./screenshots/lighthouse-*.json.
 */
import { chromium } from "@playwright/test";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.LH_EMAIL ?? "zain@example.com";
const PASSWORD = process.env.LH_PASSWORD ?? "demo-password-123";
const PAGES = ["/my-day", "/leads", "/performance"];
const OUT = path.resolve(process.cwd(), "screenshots");
const PORT = 9333;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const installed = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
  ].find((p) => fs.existsSync(p));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "cao-lh-"));
  // A plain Chrome process: Lighthouse drives it through the debugging port.
  const chrome = spawn(process.env.CHROME_PATH ?? installed ?? chromium.executablePath(), [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ]);
  const results: { page: string; score: number; failing: string[] }[] = [];
  try {
    // Sign in once over CDP; the cookie stays in this browser's profile.
    let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null;
    for (let i = 0; i < 30 && !browser; i++) {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`).catch(() => null);
      if (!browser) await new Promise((r) => setTimeout(r, 500));
    }
    if (!browser) throw new Error("Chrome didn't start with remote debugging.");
    const page = await browser.contexts()[0]!.newPage();
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/my-day/, { timeout: 30_000 });
    await page.close();
    await browser.close(); // disconnects; the Chrome process keeps running

    for (const p of PAGES) {
      const file = path.join(OUT, `lighthouse${p.replace(/\//g, "-")}.json`);
      const cmd = [
        "pnpm dlx lighthouse@12",
        `"${BASE_URL}${p}"`,
        `--port=${PORT}`,
        "--only-categories=accessibility",
        "--output=json",
        `--output-path="${file}"`,
        "--quiet",
        "--preset=desktop",
      ].join(" ");
      try {
        execSync(cmd, { stdio: ["ignore", "ignore", "pipe"] });
      } catch (e) {
        throw new Error(`Lighthouse failed for ${p}. Is the app running at ${BASE_URL}?\n${String((e as { stderr?: Buffer }).stderr ?? "").slice(-800)}`);
      }
      const report = JSON.parse(fs.readFileSync(file, "utf8")) as {
        categories: { accessibility: { score: number } };
        audits: Record<string, { score: number | null; title: string; scoreDisplayMode: string }>;
      };
      const failing = Object.values(report.audits)
        .filter((a) => a.scoreDisplayMode === "binary" && a.score === 0)
        .map((a) => a.title);
      results.push({ page: p, score: Math.round(report.categories.accessibility.score * 100), failing });
    }
  } finally {
    chrome.kill();
    await new Promise((r) => setTimeout(r, 500));
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  }
  for (const r of results) {
    console.log(`${r.page}: accessibility ${r.score}${r.failing.length ? `  (failing: ${r.failing.join("; ")})` : ""}`);
  }
  if (results.some((r) => r.score < 95)) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
