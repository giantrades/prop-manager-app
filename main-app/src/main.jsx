import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import '@apps/ui/styles.css'
import { CurrencyProvider, FiltersProvider, DataProvider, PlatformProvider } from '@apps/state'
import { JournalProvider } from '@apps/journal-state';
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';
import {useDrive} from "@apps/state/DriveContext";
import { DriveProvider } from "@apps/state/DriveContext";

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter
      future={{ v7_relativeSplatPath: true }}>
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
    </BrowserRouter>
  </React.StrictMode>
);