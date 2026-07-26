import { getCurrentLocale } from "./i18n";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
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
