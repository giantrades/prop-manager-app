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
import { initMonitoring } from './monitoring';

initMonitoring();

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
