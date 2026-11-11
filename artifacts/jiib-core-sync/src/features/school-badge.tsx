// School settings → School profile: upload, change or remove the school badge.
// The picture is shrunk in the browser (max 256px, transparency kept) so a big phone photo is fine, then stored with the school.
import { useRef, useState } from 'react';
import { Building2, ImagePlus, Trash2 } from 'lucide-react';
import { jiibApi } from '@/lib/jiib-api';
import { updateActiveSchoolBadge } from '@/lib/school-badge';

type SchoolLike = { id: string; name: string; logoUrl?: string | null };

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_STORED_CHARS = 200_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture. Try a PNG or JPG.')); };
    image.src = url;
  });
}

async function shrink(file: File): Promise<string> {
  const image = await loadImage(file);
  for (const side of [256, 192, 128]) {
    const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser cannot prepare this picture. Please try another browser.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/webp', 0.9);
    if (out.length <= MAX_STORED_CHARS) return out;
  }
  throw new Error('That picture is too detailed to store. Please choose a simpler or smaller image.');
}

export function SchoolBadgeField({ school }: { school: SchoolLike }) {
  const input = useRef<HTMLInputElement>(null);
  const [badge, setBadge] = useState<string | null>(school.logoUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const send = async (logoUrl: string | null) => {
    const saved = await jiibApi<{ logoUrl: string | null }>(`/api/schools/${encodeURIComponent(school.id)}/logo`, {
      method: 'PUT',
      body: JSON.stringify({ logoUrl }),
    });
    setBadge(saved.logoUrl ?? null);
    updateActiveSchoolBadge(saved.logoUrl ?? null);
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setNotice('');
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) { setError('Please choose a PNG, JPG or WebP picture.'); return; }
    if (file.size > MAX_FILE_BYTES) { setError('That picture is larger than 8 MB. Please choose a smaller one.'); return; }
    setBusy(true);
    try {
      await send(await shrink(file));
      setNotice('Badge saved. It now appears on report cards and in the app.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The badge could not be saved. Please try again.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setError(''); setNotice(''); setBusy(true);
    try { await send(null); setNotice('Badge removed.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The badge could not be removed. Please try again.'); }
    finally { setBusy(false); }
  };

  return <div className="mb-5 flex flex-wrap items-center gap-4 border-b border-border pb-5" data-testid="school-badge-field">
    <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted/40">
      {badge ? <img data-testid="img-school-badge" src={badge} alt={`${school.name} badge`} className="h-full w-full object-contain p-1" /> : <Building2 size={28} className="text-muted-foreground" />}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold">School badge</p>
      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Shown on report cards and at the top of the app. A square picture with a clear background works best (PNG, JPG or WebP).</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input ref={input} data-testid="input-school-badge" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void choose(e.target.files?.[0])} />
        <button type="button" data-testid="button-upload-badge" disabled={busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"><ImagePlus size={14} /> {busy ? 'Saving…' : badge ? 'Change badge' : 'Upload badge'}</button>
        {badge && <button type="button" data-testid="button-remove-badge" disabled={busy} onClick={() => void remove()} className="inline-flex items-center gap-2 rounded-lg border border-input px-3.5 py-2 text-xs font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-60"><Trash2 size={14} /> Remove</button>}
      </div>
      {error && <p role="alert" data-testid="text-badge-error" className="mt-2 text-xs text-destructive">{error}</p>}
      {notice && <p role="status" data-testid="text-badge-notice" className="mt-2 text-xs text-emerald-700">{notice}</p>}
    </div>
  </div>;
}
