import { getCurrentLocale } from "./i18n";

let guestSessionPromise: Promise<void> | undefined;

function shareToken() {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("share") ?? undefined;
}

async function ensureGuestSession() {
  if (!guestSessionPromise) {
    guestSessionPromise = fetch("/api/session/guest", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).then((response) => {
      if (!response.ok) throw new Error("Relay could not create a private workspace session.");
    }).finally(() => { guestSessionPromise = undefined; });
  }
  return guestSessionPromise;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = shareToken();
  const perform = () => fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Relay-Share-Token": token } : {}),
      ...init?.headers,
    },
  });
  let response = await perform();
  if (response.status === 401 && !token && path !== "/api/session/guest") {
    await ensureGuestSession();
    response = await perform();
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`) as Error & { details?: unknown };
    error.details = body.details;
    throw error;
  }
  return body as T;
}

export function formatDate(value?: string, includeTime = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(getCurrentLocale() === "zh-TW" ? "zh-TW" : "en", {
    month: "short",
    day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

export function formatMoney(value?: number) {
  if (value == null) return "—";
  return `NT$${new Intl.NumberFormat(getCurrentLocale() === "zh-TW" ? "zh-TW" : "en-US", { maximumFractionDigits: 0 }).format(value)}`;
}
