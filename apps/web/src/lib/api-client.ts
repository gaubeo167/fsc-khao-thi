export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  keepalive?: boolean;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, keepalive } = opts;
  const res = await fetch(path.startsWith("/") ? path : `/${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
    keepalive,
  });

  if (!res.ok) {
    let payload: { error?: string; message?: string; issues?: unknown } = {};
    try {
      payload = await res.json();
    } catch {
      // non-JSON error body
    }
    throw new ApiError(
      res.status,
      payload.error ?? "request_failed",
      payload.message ?? `Request failed with status ${res.status}`,
      payload.issues,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Returns the `Authorization: Bearer <idToken>` header for the currently
 * signed-in user, or `{}` when not signed in (protected /api routes then
 * reject with 401). Spread into a fetch's `headers` when calling
 * auth-protected /api/* routes (AI generation, import parsing, …):
 *
 *   headers: { "content-type": "application/json", ...(await authHeaders()) }
 *
 * Safe for multipart/form-data uploads too — it only adds Authorization,
 * never content-type.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    // Lazy import to keep this module usable in non-browser contexts.
    const { getAuthSafe } = await import("@/lib/firebase");
    const user = getAuthSafe().currentUser;
    if (!user) return {};
    const token = await user.getIdToken();
    return { authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}
