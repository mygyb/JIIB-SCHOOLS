import type { Request } from "express";

type SupabaseRow = Record<string, unknown>;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be configured");
}

function getHeaders(req: Request, extra: Record<string, string> = {}) {
  const authorization = req.header("authorization");
  return {
    apikey: supabaseAnonKey,
    Authorization: authorization ?? `Bearer ${supabaseAnonKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function getEndpoint(table: string, query = "") {
  return `${supabaseUrl}/rest/v1/${table}${query}`;
}

export async function supabaseRequest<T>(
  req: Request,
  table: string,
  init: RequestInit = {},
  query = "",
): Promise<T> {
  const response = await fetch(getEndpoint(table, query), {
    ...init,
    headers: {
      ...getHeaders(req),
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  const raw = await response.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  if (!response.ok) {
    const detail =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: unknown }).message)
        : `Supabase request failed with ${response.status}`;
    throw new Error(detail);
  }

  return data as T;
}

export function jsonBody(value: unknown) {
  return JSON.stringify(value);
}

export function asRows(value: unknown): SupabaseRow[] {
  return Array.isArray(value) ? (value as SupabaseRow[]) : [];
}

export function valueOf<T>(row: SupabaseRow, key: string, fallback: T): T {
  return (row[key] as T | undefined) ?? fallback;
}