import type { Page } from "@playwright/test";
import { addDays, isoWeekday, todayIn } from "../../src/lib/dates";
import { admin, clientAs, ensureTeam, ensureUser, expect, signIn, test, type Member } from "./helpers";

/** Social media module (docs/09 section 7): the five end-to-end flows. */
test.describe.configure({ mode: "serial" });

const RUN = Date.now() % 100000;
const NY = "America/New_York";
let ids: Record<Member, string>;
let accountId: string;

test.beforeAll(async () => {
  const team = await ensureTeam();
  const hina = await ensureUser("hina");
  ids = { ...team, hina };
  const { data, error } = await admin()
    .from("social_accounts")
    .insert({ name: `E2E LinkedIn page ${RUN}`, platform: "linkedin_page", audience_timezone: NY })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  accountId = data.id;
});

async function pick(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** A post arranged directly in the database (service role: the system, so the guard allows any state). */
async function arrangePost(fields: { title: string; scheduledAt: Date; status?: "planned" | "drafting"; needsApproval?: boolean }) {
  const { data, error } = await admin()
    .from("posts")
    .insert({
      account_id: accountId,
      assignee_id: ids.hina,
      created_by: ids.zain,
      title: fields.title,
      scheduled_at: fields.scheduledAt.toISOString(),
      timezone: NY,
      needs_approval: fields.needsApproval ?? true,
      status: fields.status ?? "planned",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function openPost(page: Page, id: string) {
  await page.goto(`/content?post=${id}`);
  const sheet = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Brief" }) });
  await expect(sheet).toBeVisible();
  return sheet;
}

test("the founder invites a social media manager, who can't open sales pages", async ({ page }) => {
  const email = `smm${RUN}@example.com`;
  await signIn(page, "zain");
  await page.goto("/team");
  await page.getByRole("button", { name: "Invite member" }).click();
  const sheet = page.getByRole("dialog", { name: "Invite member" });
  await sheet.getByLabel("Full name").fill("Sana Social");
  await sheet.getByLabel("Email").fill(email);
  await pick(page, "Role", "Social media manager");
  // A social media manager has no niche
  await expect(sheet.getByRole("combobox", { name: "Primary niche" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Send invite" }).click();
  await expect(page.getByText(`Invite sent to ${email}`)).toBeVisible();
  await expect(page.getByTestId(`member-${email}`)).toContainText("Social media manager");
  const { data } = await admin().from("profiles").select("role, primary_niche_id").eq("email", email).single();
  expect(data).toEqual({ role: "social", primary_niche_id: null });

  // The SMM's navigation and blocked routes
  await signIn(page, "hina");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText([/My Day/, /Content/, /Tasks/, /Performance/]);
  for (const path of ["/leads", "/pipeline", "/feed", "/team", "/settings/lists"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/my-day/);
  }
  await expect(page.getByText("That page isn't part of your role.").first()).toBeVisible();

  // And the database refuses them sales data
  const hina = await clientAs("hina");
  const { data: leads } = await hina.from("leads").select("id");
  expect(leads).toEqual([]);
  const { error } = await hina
    .from("leads")
    .insert({ owner_id: ids.hina, company_name: "Nope", niche_id: (await admin().from("niches").select("id").limit(1).single()).data!.id, channel_id: (await admin().from("channels").select("id").limit(1).single()).data!.id });
  expect(error).not.toBeNull();
});

test("a posting schedule puts slots on the week view for the founder and the SMM", async ({ page }) => {
  await signIn(page, "zain");
  await page.goto("/content/schedules");
  await page.getByRole("button", { name: "New schedule" }).first().click();
  const sheet = page.getByRole("dialog", { name: "New schedule" });
  await pick(page, "Account", `E2E LinkedIn page ${RUN}`);
  await pick(page, "Assigned to", "Hina Raza");
  // every day of the week at 9:00 AM New York
  for (const d of ["Tue", "Thu", "Sat", "Sun"]) await sheet.getByRole("button", { name: d, exact: true }).click();
  await sheet.getByRole("textbox", { name: "Time", exact: true }).fill("09:00");
  await expect(sheet.getByTestId("schedule-preview").getByRole("listitem")).toHaveCount(3);
  await expect(sheet.getByTestId("schedule-preview")).toContainText("9:00 AM New York");
  await sheet.getByRole("button", { name: "Create schedule" }).click();
  await expect(page.getByText("Schedule created")).toBeVisible();

  const { data: schedule } = await admin().from("posting_schedules").select("id").eq("account_id", accountId).single();
  const { data: slots } = await admin().from("posts").select("scheduled_at").eq("schedule_id", schedule!.id);
  expect(slots!.length).toBeGreaterThanOrEqual(27);
  // every slot is 9:00 AM in New York, whatever the UTC offset that day
  for (const s of slots!) {
    expect(new Intl.DateTimeFormat("en-US", { timeZone: NY, hour: "numeric", minute: "2-digit" }).format(new Date(s.scheduled_at!))).toBe("9:00 AM");
  }

  // Next week's Monday has a slot, for the founder and for Hina
  const today = todayIn("Asia/Karachi");
  const monday = addDays(today, 8 - isoWeekday(today));
  await page.goto(`/content?date=${monday}&account=${accountId}`);
  await expect(page.getByTestId(`day-${monday}`).getByTestId("post-card")).toHaveCount(1);

  await signIn(page, "hina");
  await page.goto(`/content?date=${monday}&account=${accountId}`);
  await expect(page.getByTestId(`day-${monday}`).getByTestId("post-card")).toHaveCount(1);
});

test("draft, submit, changes, resubmit, approve and post, with feed, task and performance", async ({ page }) => {
  const title = `Review loop ${RUN}`;
  const id = await arrangePost({ title, scheduledAt: new Date(Date.now() + 26 * 3600_000) });
  await admin().from("tasks").insert({
    assignee_id: ids.hina,
    created_by: ids.zain,
    title: `Publish 1 post ${RUN}`,
    kind: "count",
    metric: "posts_published",
    target_count: 1,
    due_date: todayIn("Asia/Karachi"),
  });

  // Hina drafts and submits
  await signIn(page, "hina");
  let sheet = await openPost(page, id);
  await expect(sheet.getByTestId("post-time")).toContainText("New York (");
  await sheet.getByRole("button", { name: "Start drafting" }).click();
  await expect(page.getByText("Drafting started")).toBeVisible();
  await sheet.getByLabel("Caption").fill("Every missed call is a lost patient.");
  await expect(sheet.getByText("36 / 3,000")).toBeVisible();
  await sheet.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Sent for review")).toBeVisible();

  // Zain requests changes from My Day
  await signIn(page, "zain");
  const review = page.getByTestId("needs-review");
  await expect(review).toContainText(title);
  await review.getByRole("button", { name: new RegExp(`^Request changes\\W+${title}$`) }).click();
  const dialog = page.getByRole("dialog", { name: "Request changes" });
  await dialog.getByRole("button", { name: "Request changes", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Say what needs to change.");
  await dialog.getByLabel("What needs to change").fill("Lead with the number.");
  await dialog.getByRole("button", { name: "Request changes", exact: true }).click();
  await expect(page.getByText("Changes requested", { exact: true }).first()).toBeVisible();

  // Hina sees the note, rewrites and resubmits
  await signIn(page, "hina");
  await expect(page.getByTestId("changes-requested")).toContainText(title);
  sheet = await openPost(page, id);
  await expect(sheet.getByTestId("review-thread")).toContainText("Lead with the number.");
  await sheet.getByLabel("Caption").fill("1 in 5 callers hang up. Every missed call is a lost patient.");
  await sheet.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Sent for review")).toBeVisible();
  // She can't approve her own post
  await expect(sheet.getByRole("button", { name: "Approve" })).toHaveCount(0);

  // Zain approves
  await signIn(page, "zain");
  sheet = await openPost(page, id);
  await sheet.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Post approved")).toBeVisible();

  // Hina marks it as posted
  await signIn(page, "hina");
  sheet = await openPost(page, id);
  await sheet.getByRole("button", { name: "Mark as posted" }).click();
  const posted = page.getByRole("dialog", { name: "Mark as posted" });
  await posted.getByRole("button", { name: "Mark as posted" }).click();
  await expect(posted.getByText("Add the live post link to mark it as posted.")).toBeVisible();
  await posted.getByLabel("Live post link").fill("https://www.linkedin.com/feed/update/123");
  await posted.getByRole("button", { name: "Mark as posted" }).click();
  await expect(page.getByText("Marked as posted")).toBeVisible();

  const { data: post } = await admin().from("posts").select("status, post_url").eq("id", id).single();
  expect(post).toEqual({ status: "posted", post_url: "https://www.linkedin.com/feed/update/123" });
  const { data: task } = await admin().from("tasks").select("completed_at").eq("title", `Publish 1 post ${RUN}`).single();
  expect(task!.completed_at).not.toBeNull();
  const { data: feed } = await admin().from("feed_events").select("kind").eq("post_id", id).order("id");
  expect(feed!.map((f) => f.kind)).toEqual(["post_submitted", "changes_requested", "post_submitted", "post_approved", "post_published"]);

  // The founder sees it in the feed and in Performance → Social
  await signIn(page, "zain");
  await page.goto("/feed?types=social");
  await expect(page.getByTestId("feed-row").filter({ hasText: `published '${title}'` })).toBeVisible();
  // Social numbers count posts by their scheduled day, and this one is scheduled for tomorrow.
  const day = todayIn("Asia/Karachi");
  await page.goto(`/performance?tab=social&range=custom&from=${addDays(day, -1)}&to=${addDays(day, 3)}`);
  await expect(page.getByTestId("social-summary")).toContainText("Posted");
  await expect(page.getByTestId("social-posts")).toContainText(title);
});

test("a late post shows as missed after a page load and can still be posted late", async ({ page }) => {
  const title = `Missed post ${RUN}`;
  const id = await arrangePost({ title, scheduledAt: new Date(Date.now() - 3 * 3600_000), status: "drafting" });

  await signIn(page, "hina");
  await page.goto("/content?view=list");
  const { data: after } = await admin().from("posts").select("status").eq("id", id).single();
  expect(after!.status).toBe("missed");

  const sheet = await openPost(page, id);
  await expect(sheet.getByText("This post missed its time.")).toBeVisible();
  await sheet.getByRole("button", { name: "Mark as posted" }).click();
  const posted = page.getByRole("dialog", { name: "Mark as posted" });
  await posted.getByLabel("Live post link").fill("https://www.linkedin.com/feed/update/456");
  await posted.getByRole("button", { name: "Mark as posted" }).click();
  await expect(page.getByText("Marked as posted")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Posted late")).toBeVisible();

  const { data: feed } = await admin().from("feed_events").select("kind, summary").eq("post_id", id).order("id");
  expect(feed!.map((f) => f.kind)).toEqual(["post_missed", "post_published"]);
  expect(feed![1]!.summary).toContain("(late)");
});

test("the SMM suggests an idea and the founder schedules it", async ({ page }) => {
  const title = `Idea ${RUN}`;
  await signIn(page, "hina");
  await page.goto("/content");
  await page.getByRole("button", { name: "Suggest an idea" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Suggest an idea" });
  await pick(page, "Account", `E2E LinkedIn page ${RUN}`);
  await sheet.getByLabel("Title").fill(title);
  await sheet.getByRole("button", { name: "Suggest idea" }).click();
  await expect(page.getByText("Idea sent to the founder")).toBeVisible();
  await expect(page.getByTestId("ideas-list")).toContainText(title);

  await signIn(page, "zain");
  await page.goto("/content");
  await page.getByTestId("ideas-list").getByRole("button", { name: new RegExp(title) }).click();
  const post = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Brief" }) });
  const when = `${addDays(todayIn(NY), 3)}T10:30`;
  await post.getByLabel(/Post time/).fill(when);
  await expect(post.getByText(/Your time:/)).toBeVisible();
  await post.getByRole("button", { name: "Schedule post" }).click();
  await expect(page.getByText("Post scheduled")).toBeVisible();

  const { data } = await admin().from("posts").select("status, scheduled_at, created_by").eq("title", title).single();
  expect(data!.status).toBe("planned");
  expect(data!.created_by).toBe(ids.hina);
  expect(new Intl.DateTimeFormat("en-US", { timeZone: NY, hour: "numeric", minute: "2-digit" }).format(new Date(data!.scheduled_at!))).toBe("10:30 AM");
});
