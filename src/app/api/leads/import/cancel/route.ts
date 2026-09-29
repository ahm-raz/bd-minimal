import { cancelImport, ImportHttpError } from "@/server/import/lead-import";
import { handle } from "../route-helpers";

export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json().catch(() => {
      throw new ImportHttpError(400, "That import wasn't found.");
    });
    await cancelImport(body);
    return { ok: true };
  });
}
