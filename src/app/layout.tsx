import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_COOKIE, parseTheme, themeClass } from "@/lib/theme";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: {
    default: "Client Acquisition OS",
    template: "%s | Client Acquisition OS",
  },
  description: "Leads, outreach, pipeline and tasks for the team.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Theme from the cookie, so the first paint is already right (lib/theme.ts). No class = follow the OS.
  const theme = themeClass(parseTheme((await cookies()).get(THEME_COOKIE)?.value));
  return (
    // suppressHydrationWarning: browser extensions often add attributes to <html> before React loads.
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} h-full antialiased ${theme}`} suppressHydrationWarning>
      <body className="min-h-full">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
