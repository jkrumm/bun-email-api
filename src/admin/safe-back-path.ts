const DEFAULT_BACK_PATH = "/admin/emails";

// The `back` query param is echoed straight into redirects and links, so an
// attacker-controlled value could otherwise be used for an open redirect.
// Only same-origin, relative `/admin/...` paths are trusted; anything else
// falls back to the default inbox path.
export function safeBackPath(value: string | undefined): string {
  if (!value) return DEFAULT_BACK_PATH;
  if (!value.startsWith("/admin")) return DEFAULT_BACK_PATH;
  if (value.startsWith("//")) return DEFAULT_BACK_PATH;
  if (value.includes("\\")) return DEFAULT_BACK_PATH;

  try {
    const parsed = new URL(value, "http://internal");
    if (parsed.origin !== "http://internal") return DEFAULT_BACK_PATH;
  } catch {
    return DEFAULT_BACK_PATH;
  }

  return value;
}
