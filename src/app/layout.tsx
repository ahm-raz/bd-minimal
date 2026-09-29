import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_COOKIE, parseTheme, themeClass } from "@/lib/theme";
import "./globals.css";

// Claude-style pairing (docs/06 section 3): a clean sans for the interface and dense tables, a warm serif
// for page titles and big numbers. Anthropic's own typefaces are licensed, so these are the free equivalents.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
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
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} h-full antialiased ${theme}`} suppressHydrationWarning>
      <body className="min-h-full">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
