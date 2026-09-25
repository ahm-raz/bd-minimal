"use client";

/** Last-resort boundary when the root layout itself fails. Plain HTML: the app's styles may not have loaded. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F5F6F8", color: "#161B22", padding: 48 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Client Acquisition OS didn&apos;t start</h1>
        <p style={{ color: "#5A6472", maxWidth: 480 }}>Reload the page. If it keeps happening, restart the app and check the server log.</p>
        <button
          onClick={reset}
          style={{ marginTop: 16, height: 32, padding: "0 12px", borderRadius: 6, border: 0, background: "#0E6272", color: "#fff", fontWeight: 500 }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
