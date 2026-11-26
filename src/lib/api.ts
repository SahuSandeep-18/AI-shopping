// On the store proxy (/apps/chat), API calls must go through the proxy path
export function api(path: string) {
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/apps/chat")) {
    return "/apps/chat" + path;
  }
  return path;
}