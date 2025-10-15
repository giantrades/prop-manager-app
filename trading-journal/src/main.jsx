import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import '@apps/ui/styles.css'
import { JournalProvider } from "@apps/journal-state";
import { CurrencyProvider, FiltersProvider, DataProvider } from "@apps/state";
import '@apps/utils/googleDrive.js'
import {useDrive} from "@apps/state/DriveContext";
import { DriveProvider } from "@apps/state/DriveContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename="/journal"> 
    <DriveProvider>
    <JournalProvider>
      <CurrencyProvider>
        <FiltersProvider>
          <DataProvider>
              <App />
          </DataProvider>
        </FiltersProvider>
      </CurrencyProvider> 
      </JournalProvider>
      </DriveProvider>
    </BrowserRouter>
  </React.StrictMode>
);
