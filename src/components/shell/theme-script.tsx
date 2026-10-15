// Server component: emits the theme bootstrap inline so there is no flash of the wrong theme.
export const THEME_STORAGE_KEY = "ct-theme";

export function ThemeScript() {
  const js = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} suppressHydrationWarning />;
}
