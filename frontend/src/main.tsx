import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { store } from './store';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for PWA offline capability & background caching
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onOfflineReady() {
      console.log('[JISEMS PWA] Ready for offline field operations in Jigawa State.');
    },
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry on 4xx errors — avoids spamming the API when not authenticated
      retry: (failureCount: number, error: unknown) => {
        const err = error as { response?: { status?: number } };
        const status = err?.response?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 1;
      },
      staleTime: 60000,          // 1 minute — reduce refetch frequency
      gcTime: 5 * 60 * 1000,    // 5 minutes cache
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Auto-reload on deployment chunk update errors
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#132018',
                color: '#e8f5ee',
                border: '1px solid rgba(26,86,50,0.3)',
              },
              success: {
                iconTheme: { primary: '#22c55e', secondary: '#132018' },
              },
              error: {
                iconTheme: { primary: '#ef4444', secondary: '#132018' },
              },
            }}
          />
        </BrowserRouter>
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>
);
