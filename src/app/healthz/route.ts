export const dynamic = "force-dynamic";

/** Readiness check for the e2e web server. */
export function GET() {
  return new Response("ok");
}
