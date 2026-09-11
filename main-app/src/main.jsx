import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import '@apps/ui/styles.css'
import { CurrencyProvider, FinanceProvider, CommandProvider } from '@apps/state'
import { DriveProvider } from "@apps/state/DriveContext";
import AuthGate from './AuthGate.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import BridgeAutoSync from './BridgeAutoSync.jsx';
import { ToastProvider } from '@apps/ui/Toast';
import { setDisplayCurrency } from '@apps/ui/currency';
import { initMonitoring } from './monitoring';

initMonitoring();

// Inicializa a moeda de exibição antes do 1º render (evita flash em USD).
try {
  const cur = localStorage.getItem('currency') === 'BRL' ? 'BRL' : 'USD';
  const rate = parseFloat(localStorage.getItem('usdBrlRate')) || 5;
  setDisplayCurrency(cur, rate);
} catch {
  /* noop */
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter
      future={{ v7_relativeSplatPath: true }}>
      <DriveProvider>
        <CurrencyProvider>
          <FinanceProvider>
            <ToastProvider>
              <BridgeAutoSync />
              <CommandProvider>
                <AuthGate>
                  <ErrorBoundary>
                    <App />
                  </ErrorBoundary>
                </AuthGate>
              </CommandProvider>
            </ToastProvider>
          </FinanceProvider>
        </CurrencyProvider>
      </DriveProvider>
    </BrowserRouter>
  </React.StrictMode>
);
