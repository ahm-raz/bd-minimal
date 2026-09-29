import type { Page } from "@playwright/test";
import { addDays, isoWeekday, todayIn, weekdayShort } from "../../src/lib/dates";
import { admin, clientAs, ensureTeam, expect, signIn, test, type Who } from "./helpers";

test.describe.configure({ mode: "serial" });

let ids: Record<Who, string>;
const RUN = Date.now() % 100000;
test.beforeAll(async () => {
  ids = await ensureTeam();
});

async function refId(table: "niches" | "channels", name: string) {
  const { data } = await admin().from(table).select("id").eq("name", name).single();
  return data!.id;
}

async function pick(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function addLead(who: Who, company: string) {
  const c = await clientAs(who);
  const { data, error } = await c
    .from("leads")
    .insert({ owner_id: ids[who], company_name: company, niche_id: await refId("niches", "Law"), channel_id: await refId("channels", "Email") })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await c.from("contacts").insert({ lead_id: data.id, first_name: "Pat", is_primary: true, email: "p@x.com" });
  return data.id;
}

test("a repeating count task appears Mon–Fri only, once per day", async ({ page }) => {
  const title = `Add 3 leads ${RUN}`;
  await signIn(page, "zain");
  await page.goto("/tasks");
  const sheet = page.getByRole("dialog", { name: "New task" });
  // T opens New task (retry until the page has hydrated)
  await expect(async () => {
    await page.keyboard.press("t");
    await expect(sheet).toBeVisible({ timeout: 1000 });
  }).toPass();
  await pick(page, "Assign to", "Ahmed Khan");
  await sheet.getByLabel("Target").fill("3");
  await expect(sheet.getByLabel("Title")).toHaveValue("Add 3 leads");
  await sheet.getByLabel("Title").fill(title);
  await sheet.getByLabel("Repeat on weekdays").click();
  await sheet.getByRole("button", { name: "Assign task" }).click();
  await expect(page.getByText("Task assigned")).toBeVisible();

  const { data: tpl } = await admin().from("task_templates").select("id").eq("title", title).single();
  const today = todayIn("Asia/Karachi");
  // the whole of next week, Monday to Sunday, twice
  const monday = addDays(today, 8 - isoWeekday(today));
  const zain = await clientAs("zain");
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 7; i++) {
      await zain.rpc("ensure_recurring_tasks", { p_user: ids.ahmed, p_day: addDays(monday, i) });
    }
  }
  const { data: rows } = await admin().from("tasks").select("due_date").eq("template_id", tpl!.id).gte("due_date", monday).lte("due_date", addDays(monday, 6));
  const days = rows!.map((r) => r.due_date).sort();
  expect(days).toEqual([0, 1, 2, 3, 4].map((i) => addDays(monday, i)));

  // The Tasks page on a Saturday shows none of it; on the Monday it's there
  await page.goto(`/tasks?date=${addDays(monday, 5)}`);
  await expect(page.getByTestId("tasks-Ahmed Khan").getByText(title)).toHaveCount(0);
  await page.goto(`/tasks?date=${monday}`);
  await expect(page.getByTestId("tasks-Ahmed Khan").getByText(title)).toBeVisible();

  // Repeating tab lists it; stopping keeps existing tasks
  await page.goto("/tasks?tab=repeating");
  await page.getByTestId(`template-${title}`).getByRole("button", { name: "Stop repeating" }).click();
  await expect(page.getByTestId(`template-${title}`).getByText("Stopped")).toBeVisible();
  const { count } = await admin().from("tasks").select("id", { count: "exact", head: true }).eq("template_id", tpl!.id);
  expect(count).toBeGreaterThanOrEqual(5);
});

test("a count task completes itself at target and posts to the feed", async ({ page }) => {
  const title = `Add 2 law leads ${RUN}`;
  await signIn(page, "zain");
  await page.goto("/tasks");
  await page.getByRole("button", { name: /^Task/ }).click();
  const sheet = page.getByRole("dialog", { name: "New task" });
  await pick(page, "Assign to", "Sara Iqbal");
  await sheet.getByLabel("Target").fill("2");
  await sheet.getByLabel("Title").fill(title);
  await pick(page, "Only count niche", "Law");
  await sheet.getByRole("button", { name: "Assign task" }).click();
  await expect(page.getByText("Task assigned")).toBeVisible();

  await signIn(page, "sara");
  await page.goto("/my-day");
  await expect(page.getByTestId(`task-${title}`).getByTestId("task-progress")).toHaveText("0/2");
  await addLead("sara", `Count One Law ${RUN}`);
  await page.reload();
  await expect(page.getByTestId(`task-${title}`).getByTestId("task-progress")).toHaveText("1/2");
  await addLead("sara", `Count Two Law ${RUN}`);

  const { data: task } = await admin().from("tasks").select("id, completed_at").eq("title", title).single();
  expect(task!.completed_at).not.toBeNull();
  const { data: feed } = await admin().from("feed_events").select("kind, subject_user_id").eq("task_id", task!.id)
    .order("id");
  // Zain assigning it is news for Sara (M11); completing it is news for Zain.
  expect(feed).toEqual([
    { kind: "task_assigned", subject_user_id: ids.sara },
    { kind: "task_completed", subject_user_id: ids.sara },
  ]);

  await page.reload();
  await page.getByRole("button", { name: /done today/ }).click();
  await expect(page.getByTestId(`task-${title}`).getByText("Done")).toBeVisible();

  // BDs can't tick count tasks or change a task's title (the database rejects both)
  const sara = await clientAs("sara");
  const tick = await sara.from("tasks").update({ completed_at: null }).eq("id", task!.id);
  expect(tick.error?.message).toMatch(/Count tasks complete automatically/);
  const rename = await sara.from("tasks").update({ title: "Easy task" }).eq("id", task!.id);
  expect(rename.error).not.toBeNull();
});

test("flag lead creates a lead-fix task, and ticking it clears the badge", async ({ page }) => {
  const lead = await addLead("ahmed", `Clinic Pro ${RUN}`);
  await signIn(page, "zain");
  await page.goto(`/leads/${lead}`);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Flag lead" }).click();
  await page.getByLabel("What needs fixing").fill("Need the owner's name and direct email.");
  await page.getByRole("button", { name: "Flag lead" }).click();
  await expect(page.getByTestId("flag-badge")).toBeVisible();
  const { data: fix } = await admin().from("tasks").select("title, due_date, assignee_id, kind").eq("lead_id", lead).single();
  expect(fix).toMatchObject({ kind: "lead_fix", assignee_id: ids.ahmed, due_date: todayIn("Asia/Karachi") });

  await signIn(page, "ahmed");
  await page.goto("/my-day");
  const row = page.getByTestId(`task-${fix!.title}`);
  await expect(row).toContainText(`Clinic Pro ${RUN}`);
  await row.getByRole("checkbox").click();
  await expect(page.getByText("Task done")).toBeVisible();
  await page.goto(`/leads/${lead}`);
  await expect(page.getByTestId("flag-badge")).toHaveCount(0);

  // BDs can untick on the same day
  const ahmed = await clientAs("ahmed");
  const { data: t } = await admin().from("tasks").select("id").eq("lead_id", lead).single();
  const untick = await ahmed.from("tasks").update({ completed_at: null }).eq("id", t!.id).select("id");
  expect(untick.data).toHaveLength(1);
});

test("overdue logic uses the assignee's time zone", async ({ page }) => {
  const berlinToday = todayIn("Europe/Berlin");
  const zain = await clientAs("zain");
  const late = `Berlin late ${RUN}`;
  const onTime = `Berlin today ${RUN}`;
  await zain.from("tasks").insert([
    { assignee_id: ids.bilal, created_by: ids.zain, title: late, kind: "checklist", due_date: addDays(berlinToday, -1) },
    { assignee_id: ids.bilal, created_by: ids.zain, title: onTime, kind: "checklist", due_date: berlinToday },
  ]);
  // The founder asks from Karachi; status still follows Berlin
  const { data } = await zain.rpc("tasks_with_progress", { p_from: addDays(berlinToday, -1), p_to: berlinToday, p_assignee: ids.bilal });
  const byTitle = Object.fromEntries((data ?? []).map((r) => [r.title, r.status]));
  expect(byTitle[late]).toBe("overdue");
  expect(byTitle[onTime]).toBe("open");

  await signIn(page, "bilal");
  await page.goto("/my-day");
  await expect(page.getByTestId(`task-${late}`)).toContainText(`Overdue since ${weekdayShort(addDays(berlinToday, -1))}`);
  await expect(page.getByTestId(`task-${onTime}`)).toContainText("Due today");
});

test("BDs see their tasks read-only on the Tasks page", async ({ page }) => {
  await signIn(page, "bilal");
  await page.goto("/tasks");
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Task/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Actions for/ })).toHaveCount(0);
  await expect(page.getByText(`Berlin today ${RUN}`)).toBeVisible();
});
