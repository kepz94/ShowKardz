import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './lib/store';
import { requestPersistence } from './lib/storage';
import { App } from './App';
import './styles.css';

// Receipt photos live on this device and nowhere else, so eviction would be a
// permanent loss rather than a cache miss. Ask once per launch; a refusal is
// not fatal and is reported on the Receipts screen instead of thrown.
void requestPersistence();

// The offline fallback. Registration failure is not fatal: the app still runs,
// it just will not open without signal — so it is logged, never thrown.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch((err) => console.error('Service worker registration failed', err));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
