// Fetch a PDF endpoint with the current access token, convert it to a
// Blob URL, and trigger a download or open it in a new tab.
//
// Why this exists: a plain `<a href="/api/v1/...">` and `window.open(...)`
// do NOT carry the Authorization header. In dev with the admin sentinel
// token bypass the existing receipt links happened to work; in production,
// authMiddleware refuses Bearer-less requests with 401 — so the existing
// POS receipt button only printed silently and the new invoice download
// would have failed the same way. Fetching with the header attached and
// turning the result into a Blob URL fixes both surfaces.
import { store } from '@/app/store';
import { toast } from 'sonner';

export interface DownloadOptions {
  /** Suggested filename when `mode: 'download'`. Ignored when previewing. */
  filename?: string;
  /** 'preview' opens a new tab; 'download' triggers a save dialog. */
  mode?: 'preview' | 'download';
}

/**
 * Fetches a same-origin PDF endpoint with the bearer token attached and
 * presents it to the user. Returns when the download dialog is triggered
 * (or the new tab is opened) — toasts on failure so the caller doesn't
 * need to.
 */
export async function downloadPdf(url: string, opts: DownloadOptions = {}): Promise<void> {
  const { filename, mode = 'preview' } = opts;
  const token = store.getState().auth.accessToken;
  try {
    const res = await fetch(url, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      // Try to surface the server's error message — the API returns JSON
      // shapes for errors, so we can parse to extract it.
      let message = `Could not load PDF (${res.status})`;
      try {
        const body = (await res.clone().json()) as { error?: { message?: string } };
        if (body?.error?.message) message = body.error.message;
      } catch {
        // ignore — keep the generic message
      }
      toast.error(message);
      return;
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    if (mode === 'download') {
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename ?? 'invoice.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      // Open in a new tab. Some browsers (Safari) block this unless the
      // call happens synchronously inside a user gesture; the caller
      // should already be wired to a click handler.
      window.open(objectUrl, '_blank', 'noopener');
    }
    // Release the blob URL after a short delay so the new tab / save
    // dialog has time to consume it. Without this we'd leak one per call.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not load PDF');
  }
}
