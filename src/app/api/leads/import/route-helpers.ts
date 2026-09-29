import "server-only";
import { NextResponse } from "next/server";
import { getViewer, type Viewer } from "@/server/auth";
import { ImportHttpError } from "@/server/import/lead-import";

/** Shared wrapper for the import endpoints: session required, errors as JSON, nothing sensitive logged. */
export async function handle(run: (viewer: Viewer) => Promise<unknown>): Promise<NextResponse> {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
  try {
    return NextResponse.json(await run(viewer));
  } catch (e) {
    if (e instanceof ImportHttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    // Only the error's name: file contents never reach the logs.
    console.error("lead import failed:", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "The import couldn't be processed. No leads were added. Try again." }, { status: 500 });
  }
}
