import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import '@/design-system/global.css';
import { Providers } from '@/app/Providers';
import { preloadRoute, router } from '@/app/router';
import { createDefaultSource } from '@/data/DataProvider';

async function start() {
  preloadRoute(window.location.pathname);
  const source = await createDefaultSource();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Providers source={source}>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  );
}

start().catch((error: unknown) => {
  const root = document.getElementById('root')!;
  root.innerHTML = '';
  const box = document.createElement('main');
  box.setAttribute('style', 'max-width:36rem;margin:15vh auto;padding:0 16px;font:16px/1.5 system-ui,sans-serif');
  const h = document.createElement('h1');
  h.textContent = 'Tifa Inventory can’t start';
  h.setAttribute('style', 'font-size:1.25rem');
  const p = document.createElement('p');
  p.textContent = error instanceof Error ? error.message : 'Something went wrong while starting the app.';
  box.append(h, p);
  root.append(box);
});
