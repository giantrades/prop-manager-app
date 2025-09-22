// src/state/DriveContext.jsx
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  initGoogleDrive, signIn, signOut, isSignedIn, uploadFile, listFiles, onAuthChange
} from "../utils/googleDrive";

const DriveContext = createContext(null);

export function DriveProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [logged, setLogged] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await initGoogleDrive();
      if (!mounted) return;
      setReady(true);
      setLogged(isSignedIn());
      onAuthChange((status) => setLogged(status));
    })();
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async () => {
    await signIn();
  }, []);

  const logout = useCallback(async () => {
    await signOut();
  }, []);

  const backup = useCallback(async (data) => {
    // nome fixo por ora; pode versionar se quiser
    return uploadFile("propmanager-backup.json", data);
  }, []);

  const files = useCallback(async () => {
    return listFiles();
  }, []);

  return (
    <DriveContext.Provider value={{ ready, logged, login, logout, backup, files }}>
      {children}
    </DriveContext.Provider>
  );
}

export function useDrive() {
  return useContext(DriveContext);
}
