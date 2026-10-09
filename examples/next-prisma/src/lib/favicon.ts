/**
 * A page's favicon from Google's favicon service. Only the hostname leaves the browser, so the
 * service never learns which page was linked.
 */
export function faviconUrl(href: string): string | null {
  try {
    const { hostname } = new URL(href);
    return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(hostname)}`;
  } catch {
    return null;
  }
}
