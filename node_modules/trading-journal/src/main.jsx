import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import '@apps/ui/styles.css'
import { JournalProvider } from "@apps/journal-state";
import { CurrencyProvider, FiltersProvider, DataProvider } from "@apps/state";
import '@apps/utils/googleDrive.js'

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename="/journal"> 
    <JournalProvider>
      <CurrencyProvider>
        <FiltersProvider>
          <DataProvider>
              <App />
          </DataProvider>
        </FiltersProvider>
      </CurrencyProvider> 
      </JournalProvider>
    </BrowserRouter>
  </React.StrictMode>
);
