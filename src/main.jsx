import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles.css'
import { CurrencyProvider } from './state/CurrencyContext.jsx'
import { FiltersProvider } from './state/FiltersContext.jsx'
import { DataProvider } from './state/DashboardDataContext.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <CurrencyProvider>
        <FiltersProvider>
          <DataProvider>
            <App />
          </DataProvider>
        </FiltersProvider>
      </CurrencyProvider>
    </BrowserRouter>
  </React.StrictMode>
);