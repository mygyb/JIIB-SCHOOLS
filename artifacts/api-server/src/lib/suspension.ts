import { asRows, supabaseAdminRequest } from "./supabase.js";

const suspensionCache = new Map<string, { at: number; suspended: boolean }>();
export async function schoolIsSuspended(schoolId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(schoolId)) return false;
  const hit = suspensionCache.get(schoolId);
  if (hit && Date.now() - hit.at < 5000) return hit.suspended;
  const row = asRows(await supabaseAdminRequest(`/rest/v1/schools?id=eq.${encodeURIComponent(schoolId)}&select=active&limit=1`))[0];
  const suspended = Boolean(row) && row.active === false;
  suspensionCache.set(schoolId, { at: Date.now(), suspended });
  return suspended;
}
export const forgetSuspension = (schoolId: string) => { suspensionCache.delete(schoolId); };
