import React, { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import Accounts from "./pages/Accounts.jsx";
import Payouts from "./pages/Payouts.jsx";
import Settings from "./pages/Settings.jsx";
import Firms from "./pages/Firms.jsx";
import Login from "./pages/Login.jsx";
import Navbar from "./Navbar";
import './styles.css';
import { useJournal } from "@apps/journal-state";
import Goals from "./pages/Goals.jsx/"
import {
  initGoogleDrive,
  isSignedIn,
  signIn,
  signOut,
  onSignChange,
  listFiles,
  backupToDrive as driveBackup,
} from "@apps/utils/googleDrive.js";

export default function App() {
  const [driveReady, setDriveReady] = useState(false);
  const [logged, setLogged] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    return localStorage.getItem("sidebarPinned") !== "false";
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Credenciais via env (VITE_GOOGLE_CLIENT_ID / VITE_GOOGLE_API_KEY) —
        // nunca hardcoded (S0.1). initGoogleDrive lança erro se faltarem.
        await initGoogleDrive();
        if (!mounted) return;
        setDriveReady(true);
        setLogged(isSignedIn());
        onSignChange(() => {
          if (!mounted) return;
          setLogged(isSignedIn());
        });
      } catch (err) {
        console.error("Falha ao inicializar Google Drive:", err);
        setDriveReady(false);
        setLogged(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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
            <Route path="/login" element={<Login />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/payouts" element={<Payouts />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/firms" element={<Firms />} />
            <Route path="/goals" element={<Goals />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
