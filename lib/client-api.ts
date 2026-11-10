"use client";

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const cookie = document.cookie.split("; ").find((part) => part.startsWith("finance_csrf="));
    if (cookie) headers.set("x-csrf-token", cookie.slice("finance_csrf=".length));
  }
  return fetch(input, { ...init, headers, credentials: "same-origin" });
}
