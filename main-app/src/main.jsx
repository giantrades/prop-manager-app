import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import '@apps/ui/styles.css'
import { AuthProvider } from '@apps/auth'
import { SyncProvider } from '@apps/sync'
import { CurrencyProvider, FiltersProvider, DataProvider, PlatformProvider } from '@apps/state'
import { JournalProvider } from '@apps/journal-state';
import { DriveProvider } from "@apps/state/DriveContext";

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter
      future={{ v7_relativeSplatPath: true }}>
      <AuthProvider>
        <SyncProvider>
          <DriveProvider>
        <JournalProvider>
          <CurrencyProvider>
            <FiltersProvider>
              <DataProvider>
                <PlatformProvider>
                  <App />
                </PlatformProvider>
              </DataProvider>
            </FiltersProvider>
          </CurrencyProvider>
          </JournalProvider>
          </DriveProvider>
        </SyncProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);