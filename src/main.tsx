import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { BackendContext, getBackend } from './api';
import { initTheme } from './lib/theme';
import './styles.css';

initTheme();

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BackendContext.Provider value={getBackend()}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BackendContext.Provider>
  </React.StrictMode>,
);
