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
