import { previewImport, ImportHttpError } from "@/server/import/lead-import";
import { handle } from "../route-helpers";

/** Step 1 (docs/04 section 10): multipart upload → analysis and a stored batch. Writes no leads. */
export async function POST(request: Request) {
  return handle(async (viewer) => {
    if (!(request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      throw new ImportHttpError(415, "Send the file as multipart/form-data.");
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ImportHttpError(400, "The upload didn't arrive complete. Try again.");
    }
    return previewImport(viewer, form);
  });
}
