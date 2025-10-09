import React, { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard.jsx";
import Accounts from "./pages/Accounts.jsx";
import Payouts from "./pages/Payouts.jsx";
import Settings from "./pages/Settings.jsx";
import Firms from "./pages/Firms.jsx";
import Navbar from "./Navbar";
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initGoogleDrive(
          "466867392278-f22vqhvgre89q3e8bvbi4je8vovnc92n.apps.googleusercontent.com",
          "AIzaSyCYWpRFtpOjjZym0UhKQIN3zU7-y557E9M"
        );
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

  const handleLogin = async () => {
    await signIn();
    setLogged(isSignedIn());
  };
  const handleLogout = async () => {
    await signOut();
    setLogged(isSignedIn());
  };
  const handleBackup = async () => {
    await driveBackup(); // backup direto
  };
  const handleList = async () => {
    const files = await listFiles();
    console.log("📄 Arquivos no Drive:", files);
    alert("Arquivos listados no console.");
  };

  return (
    <div>
      <Navbar
        driveReady={driveReady}
        logged={logged}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onBackup={handleBackup}
        onList={handleList}
      />
      <main className="container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/payouts" element={<Payouts />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/firms" element={<Firms />} />
          <Route path="/goals" element={<Goals />} />
        </Routes>
      </main>
    </div>
  );
}
