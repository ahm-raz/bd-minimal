/**
 * Light / dark / follow the system, remembered per browser in a cookie. The root layout reads the cookie and
 * puts "dark" or "light" on <html>; "system" leaves it off and globals.css follows the OS (no script needed).
 */
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABELS: Record<Theme, string> = { light: "Light", dark: "Dark", system: "Same as system" };
export const THEME_COOKIE = "cao-theme";

export function parseTheme(value: string | undefined | null): Theme {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "system";
}

/** The class for <html>: forced dark, forced light, or none for "system". */
export function themeClass(theme: Theme): string {
  return theme === "system" ? "" : theme;
}

/** Browser only: the saved choice. */
export function readTheme(): Theme {
  if (typeof document === "undefined") return "system";
  return parseTheme(document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`))?.[1]);
}

/** Browser only: save the choice for a year and apply it without a reload. */
export function saveTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  const root = document.documentElement.classList;
  root.remove("dark", "light");
  if (theme !== "system") root.add(theme);
}
