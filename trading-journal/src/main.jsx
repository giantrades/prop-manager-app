import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import '@apps/ui/styles.css'
import { JournalProvider } from "@apps/journal-state";
import { CurrencyProvider, FiltersProvider, DataProvider, PlatformProvider } from "@apps/state";
import '@apps/utils/googleDrive.js'
import {useDrive} from "@apps/state/DriveContext";
import { DriveProvider } from "@apps/state/DriveContext";
import { AuthProvider } from "@apps/auth";
import { SyncProvider } from "@apps/sync";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename="/journal"> 
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
