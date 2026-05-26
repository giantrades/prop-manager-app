import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import './styles.css';
import TradeForm from './Components/TradeForm';
import Trades from './pages/Trades';
import Navbar from './Navbar.jsx';
import Strategies from './pages/Strategies';

export default function App() {
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    return localStorage.getItem("sidebarPinned") !== "false";
  });

  const handleTogglePin = () => {
    setSidebarPinned((p) => {
      const next = !p;
      localStorage.setItem("sidebarPinned", String(next));
      return next;
    });
  };

  return (
    <div className={`app-shell${sidebarPinned ? " sidebar-pinned" : ""}`}>
      <Navbar isPinned={sidebarPinned} onTogglePin={handleTogglePin} />
      <main className="main-content">
        <div className="container">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/trades/new" element={<TradeForm />} />
            <Route path="/trades" element={<Trades/>} />
            <Route path="/Strategies" element={<Strategies/>} />
            <Route path="/Settings" element={<Settings/>} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
