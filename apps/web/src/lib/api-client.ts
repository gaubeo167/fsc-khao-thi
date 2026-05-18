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
