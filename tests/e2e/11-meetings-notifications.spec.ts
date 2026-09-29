import { admin, clientAs, ensureTeam, ensureUser, expect, signIn, test, type Who } from "./helpers";

/** M11 (docs/10 section 5): meetings, the bell and live notifications. Google itself is covered by unit tests. */
test.describe.configure({ mode: "serial" });

let ids: Record<Who, string>;
test.beforeAll(async () => {
  ids = await ensureTeam();
});

async function refId(table: "niches" | "channels" | "activity_types", name: string) {
  const { data } = await admin().from(table).select("id").eq("name", name).single();
  return data!.id;
}

async function makeLead(who: Who, company: string) {
  const c = await clientAs(who);
  const { data, error } = await c
    .from("leads")
    .insert({
      owner_id: ids[who],
      company_name: company,
      niche_id: await refId("niches", "Dental"),
      channel_id: await refId("channels", "LinkedIn"),
      lead_timezone: "America/Chicago",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const { data: contact } = await c
    .from("contacts")
    .insert({
      lead_id: data.id,
      first_name: "Sarah",
      last_name: "Mitchell",
      is_primary: true,
      email: "sarah@meet.example",
    })
    .select("id")
    .single();
  return { leadId: data.id, contactId: contact!.id };
}

/** "yyyy-MM-ddT10:00" `days` from now. */
const dayAt = (days: number, time = "10:00") =>
  `${new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)}T${time}`;

test("book, reschedule, cancel and undo a meeting; My Day and the bell show it", async ({ page }) => {
  const { leadId } = await makeLead("ahmed", "Meeting Flow Dental");
  await signIn(page, "ahmed");
  await page.goto(`/leads/${leadId}`);
  await expect(page.getByTestId("meetings-panel")).toContainText("No meetings yet.");

  await page.getByRole("button", { name: /^Log activity/ }).click();
  const sheet = page.getByRole("dialog", { name: "Log activity" });
  await page.getByRole("combobox", { name: "Type", exact: true }).click();
  await page.getByRole("option", { name: "Reply received", exact: true }).click();
  await page.getByRole("combobox", { name: "Outcome", exact: true }).click();
  await page.getByRole("option", { name: "Meeting booked", exact: true }).click();
  // The lead's own zone is the default, with the viewer's time next to it.
  await expect(sheet.locator("#log-meeting-tz")).toContainText("America/Chicago");
  await sheet.getByLabel("Date and time").fill(dayAt(3));
  await expect(sheet.getByTestId("meeting-when")).toContainText("10:00 AM Chicago");
  await expect(sheet.getByTestId("meeting-when")).toContainText("your time");
  await sheet.getByRole("button", { name: "45 min" }).click();
  await sheet.getByRole("button", { name: "1 hour" }).click(); // adds a 60-minute reminder to the default 30 and 10
  await sheet.getByLabel("Location or link").fill("https://meet.example.com/abc");
  await sheet.getByRole("button", { name: "Log activity" }).click();
  await expect(page.locator("[data-sonner-toast]").getByText("Meeting booked", { exact: true })).toBeVisible();
  // No open deal yet, so the app offers one (docs/04 section 3).
  await page
    .getByRole("dialog", { name: /Create an opportunity/ })
    .getByRole("button", { name: "Not now" })
    .click();

  const panel = page.getByTestId("meetings-panel");
  await expect(panel).toContainText("Meeting with Sarah Mitchell (Meeting Flow Dental)");
  await expect(panel).toContainText("45 min");
  const { data: m } = await admin()
    .from("meetings")
    .select("id, duration_min, reminder_minutes, timezone, status")
    .eq("lead_id", leadId)
    .single();
  expect(m).toMatchObject({ duration_min: 45, timezone: "America/Chicago", status: "scheduled" });
  expect(m!.reminder_minutes).toEqual([60, 30, 10]);
  const { data: lead } = await admin().from("leads").select("next_action").eq("id", leadId).single();
  expect(lead!.next_action).toBe("Meeting with Sarah Mitchell");

  // Reschedule
  await panel.getByRole("button", { name: /Meeting actions/ }).click();
  await page.getByRole("menuitem", { name: "Reschedule" }).click();
  const dialog = page.getByRole("dialog", { name: "Reschedule meeting" });
  await dialog.getByLabel("Date and time").fill(dayAt(4, "11:30"));
  await dialog.getByRole("button", { name: "Save meeting" }).click();
  await expect(page.getByText("Meeting updated")).toBeVisible();
  await expect(panel).toContainText("11:30 AM Chicago");

  // Cancel needs a reason; Undo brings it back.
  await panel.getByRole("button", { name: /Meeting actions/ }).click();
  await page.getByRole("menuitem", { name: "Cancel meeting" }).click();
  const cancel = page.getByRole("dialog", { name: /Cancel the meeting/ });
  await cancel.getByRole("button", { name: "Cancel meeting" }).click();
  await expect(cancel.getByText("Say why it was cancelled.")).toBeVisible();
  await cancel.getByLabel("Reason").fill("Clinic closed that week");
  await cancel.getByRole("button", { name: "Cancel meeting" }).click();
  await expect(panel).toContainText("Cancelled");
  await expect(panel).toContainText("Clinic closed that week");
  await panel.getByRole("button", { name: /Meeting actions/ }).click();
  await page.getByRole("menuitem", { name: /Undo cancelled/ }).click();
  await expect(panel).toContainText("Scheduled");

  // My Day and What's upcoming
  await page.goto("/my-day");
  await expect(page.getByTestId("my-day-meetings")).toContainText("Sarah Mitchell · Meeting Flow Dental");
  await page.getByTestId("bell").first().click();
  await expect(page.getByTestId("upcoming-list")).toContainText("Meeting with Sarah Mitchell · Meeting Flow Dental");

  // The founder heard about the booking, the move and the cancellation; Ahmed about none of his own.
  const { data: founderN } = await admin()
    .from("notifications")
    .select("kind")
    .eq("recipient_id", ids.zain)
    .eq("meeting_id", m!.id);
  expect(founderN!.map((n) => n.kind).sort()).toEqual(["meeting_booked", "meeting_cancelled", "meeting_rescheduled"]);
  const { count } = await admin()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", ids.ahmed)
    .eq("meeting_id", m!.id);
  expect(count).toBe(0);
});

test("a reassigned lead reaches the new owner live; opening it marks it read", async ({ page }) => {
  const { leadId } = await makeLead("sara", "Live Bell Dental");
  await signIn(page, "ahmed");
  await page.goto("/my-day");
  await admin()
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", ids.ahmed)
    .is("read_at", null);
  await page.reload();
  const bell = page.getByTestId("bell").first();
  await expect(bell).toHaveAttribute("aria-label", /^Notifications(?!, [1-9]\d* unread)/);

  // The founder reassigns while Ahmed's page is open.
  const zain = await clientAs("zain");
  const { error } = await zain.from("leads").update({ owner_id: ids.ahmed }).eq("id", leadId);
  expect(error).toBeNull();
  await expect(bell).toHaveAttribute("aria-label", /1 unread/, { timeout: 15_000 });

  await bell.click();
  await page.getByRole("tab", { name: /What happened/ }).click();
  const item = page.getByTestId("happened-list").getByRole("link", { name: /reassigned lead Live Bell Dental/ });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page).toHaveURL(new RegExp(`/leads/${leadId}`));
  await expect(bell).toHaveAttribute("aria-label", /^Notifications(?!, [1-9]\d* unread)/);
  const { data } = await admin()
    .from("notifications")
    .select("read_at")
    .eq("recipient_id", ids.ahmed)
    .eq("lead_id", leadId)
    .eq("kind", "lead_reassigned")
    .single();
  expect(data!.read_at).not.toBeNull();
});

test("muting a group stops new items; the SMM hears about comments on their posts", async ({ page }) => {
  const hina = await ensureUser("hina");
  await admin().from("profiles").update({ role: "social" }).eq("id", hina);
  const zain = await clientAs("zain");
  const { data: account } = await admin()
    .from("social_accounts")
    .insert({ name: `Bell page ${Date.now()}`, platform: "linkedin_page", audience_timezone: "America/New_York" })
    .select("id")
    .single();
  const { data: post } = await zain
    .from("posts")
    .insert({
      account_id: account!.id,
      assignee_id: hina,
      title: "Bell case study",
      scheduled_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  await zain
    .from("post_comments")
    .insert({ post_id: post!.id, author_id: ids.zain, kind: "comment", body: "Use the new logo" });

  await signIn(page, "hina");
  await page.goto("/notifications");
  const list = page.getByTestId("happened-list");
  await expect(list).toContainText("assigned post 'Bell case study'");
  await expect(list).toContainText("commented on 'Bell case study'");

  // Hina mutes Social in Profile; the next comment isn't stored for her.
  await page.goto("/profile");
  const socialSwitch = page.getByRole("switch", { name: "Social in app" });
  // A click before the page is interactive does nothing, so retry until it takes.
  await expect(async () => {
    if (await socialSwitch.isChecked()) await socialSwitch.click();
    await expect(socialSwitch).not.toBeChecked({ timeout: 1000 });
  }).toPass();
  await expect
    .poll(
      async () =>
        (
          await admin()
            .from("notification_prefs")
            .select("in_app")
            .eq("user_id", hina)
            .eq("kind_group", "social")
            .maybeSingle()
        ).data?.in_app,
    )
    .toBe(false);
  await zain
    .from("post_comments")
    .insert({ post_id: post!.id, author_id: ids.zain, kind: "comment", body: "And the new colours" });
  const { count } = await admin()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", hina)
    .eq("post_id", post!.id)
    .eq("kind", "post_comment");
  expect(count).toBe(1);
  await socialSwitch.click();
  await expect(socialSwitch).toBeChecked();
});
