import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { Toaster } from 'sonner';
import { store } from '@/app/store';
import { AppRouter } from '@/app/routes';
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
