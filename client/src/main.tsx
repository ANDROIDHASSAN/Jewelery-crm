import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { Toaster } from 'sonner';
import { store } from '@/app/store';
import { AppRouter } from '@/app/routes';
import { syncPending } from '@/features/pos/offline';
import '@/styles/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <Provider store={store}>
      <AppRouter />
      <Toaster position="top-right" richColors closeButton />
    </Provider>
  </StrictMode>,
);

// Register the POS Service Worker for offline-first behaviour. Skipped on
// localhost over plain HTTP for dev simplicity (browsers permit SW on
// localhost but the Vite dev middleware HMR conflicts with cache-first SWs;
// production is HTTPS so it just works).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // When a new SW version is found and finishes installing in the
        // background, tell it to skip waiting and immediately take over.
        // This eliminates the "user sees old version on first visit"
        // bug — the next navigation gets the fresh shell.
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
        // Reload the page once a fresh SW takes control so the user gets
        // the latest bundle without a manual hard-refresh.
        let didReload = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (didReload) return;
          didReload = true;
          window.location.reload();
        });
      })
      .catch(() => {
        // SW failure is non-fatal — the app works without offline support.
      });
    // The SW posts a "pos:drain-queue" message when a background-sync event
    // fires (connectivity returns while the tab was hidden). Drain on receipt.
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'pos:drain-queue') {
        void syncPending();
      }
    });
  });
}
