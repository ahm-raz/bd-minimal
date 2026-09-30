import { revalidatePath } from "next/cache";
import { confirmImport, ImportHttpError } from "@/server/import/lead-import";
import { handle } from "../route-helpers";

/** Step 2: import a validated batch by id. The rows come from the database, never from the request. */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json().catch(() => {
      throw new ImportHttpError(400, "That import wasn't found. Upload the file again.");
    });
    const result = await confirmImport(body);
    // New leads show on Leads, My Day follow-ups, the Feed, Performance (leads added) and count tasks.
    // Imports don't create deals, so the Pipeline is unchanged.
    for (const path of ["/leads", "/my-day", "/feed", "/performance", "/tasks"]) revalidatePath(path);
    return result;
  });
}
