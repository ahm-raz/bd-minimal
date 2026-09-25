/** Light / dark / follow the system. Stored per browser in localStorage; applied as the .dark class on <html>. */
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_LABELS: Record<Theme, string> = { light: "Light", dark: "Dark", system: "Same as system" };
export const THEME_KEY = "cao:theme";

export function readTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(THEME_KEY);
  return (THEMES as readonly string[]).includes(v ?? "") ? (v as Theme) : "system";
}

export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Runs in <head> before the first paint, so there's no flash of the wrong theme. Keep in sync with applyTheme. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});var d=t==="dark"||((t!=="light")&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;
