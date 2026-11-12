// The signed-in school is cached in localStorage ('jiib.school') when someone logs in, so a badge change would not show
// until the next login. These helpers update that cache and tell every screen, and quietly pick up a badge that another
// administrator changed since this device signed in.
export const SCHOOL_BADGE_EVENT = 'jiib:school-badge';
export const SCHOOL_TYPE_EVENT = 'jiib:school-type';

type CachedSchool = { id?: string; slug?: string; logoUrl?: string | null; schoolType?: string } & Record<string, unknown>;

function readCached(): CachedSchool | null {
  try { return JSON.parse(localStorage.getItem('jiib.school') || 'null') as CachedSchool | null; } catch { return null; }
}

export function updateActiveSchoolBadge(logoUrl: string | null) {
  const cached = readCached();
  if (!cached) return;
  try { localStorage.setItem('jiib.school', JSON.stringify({ ...cached, logoUrl })); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent(SCHOOL_BADGE_EVENT, { detail: { logoUrl } }));
}

let lastCheck = 0;
let inflight: Promise<void> | null = null;

// At most one check every 5 minutes per page load; failures are ignored (the cached badge keeps showing).
export function refreshActiveSchoolBadge() {
  const cached = readCached();
  if (!cached?.slug || Date.now() - lastCheck < 5 * 60_000 || inflight) return;
  lastCheck = Date.now();
  inflight = fetch(`/api/schools/by-slug/${encodeURIComponent(cached.slug)}`)
    .then((response) => (response.ok ? response.json() as Promise<{ logoUrl?: string | null; schoolType?: string }> : null))
    .then((fresh) => {
      if (!fresh) return;
      // The super administrator can set or change the school type; pick it up without a new login.
      const type = fresh.schoolType === 'primary' ? 'primary' : 'secondary';
      if ((cached.schoolType ?? 'secondary') !== type) {
        try { localStorage.setItem('jiib.school', JSON.stringify({ ...(readCached() ?? cached), schoolType: type })); } catch { /* storage unavailable */ }
        window.dispatchEvent(new CustomEvent(SCHOOL_TYPE_EVENT, { detail: { schoolType: type } }));
      }
      if ((fresh.logoUrl ?? null) !== (cached.logoUrl ?? null)) updateActiveSchoolBadge(fresh.logoUrl ?? null);
    })
    .catch(() => undefined)
    .finally(() => { inflight = null; });
}
