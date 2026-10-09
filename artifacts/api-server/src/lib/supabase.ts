import type { Request } from "express";

type SupabaseRow = Record<string, unknown>;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  const method = (init.method ?? "GET").toUpperCase();
  const response = await fetch(getEndpoint(table, query), {
    ...init,
    headers: {
      ...getHeaders(req),
      ...(method === "POST"
        ? { Prefer: "resolution=merge-duplicates,return=representation" }
        : {}),
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

export type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export async function getSupabaseUser(req: Request): Promise<SupabaseUser | null> {
  const authorization = req.header("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: authorization,
    },
  });
  if (!response.ok) return null;
  const user = (await response.json()) as SupabaseUser;
  return typeof user.id === "string" ? user : null;
}

export function isSupabaseInviteConfigured() {
  return Boolean(supabaseServiceRoleKey);
}

export async function inviteSupabaseUser(email: string, displayName: string) {
  if (!supabaseServiceRoleKey) {
    throw new Error("Staff invitations are not configured. Add SUPABASE_SERVICE_ROLE_KEY in Replit Secrets.");
  }
  const response = await fetch(`${supabaseUrl}/auth/v1/invite`, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, data: { display_name: displayName } }),
  });
  const raw = await response.text();
  if (!response.ok) {
    if (/already registered|user already exists|already been registered/i.test(raw)) {
      return { invitationSent: false };
    }
    throw new Error("Supabase could not send the staff invitation. Check the Auth email settings and try again.");
  }
  return { invitationSent: true };
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