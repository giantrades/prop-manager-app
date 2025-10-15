import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  initGoogleDrive,
  signIn,
  signOut,
  isSignedIn,
  uploadFile,
  listFiles,
  onSignChange,
} from "../utils/googleDrive";

const DriveContext = createContext(null);

export function DriveProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [logged, setLogged] = useState(false);

  // 🔁 Canal global para sincronizar entre apps/abas
  const channel = new BroadcastChannel("drive-sync");

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const ok = await initGoogleDrive();
        if (!mounted) return;
        if (!ok) console.warn("⚠️ Falha ao inicializar o gapi");
        setReady(true);

        // 🔹 Restaura sessão anterior
        const token = localStorage.getItem("drive-token");
        if (token) {
          try {
            gapi.client.setToken(JSON.parse(token));
          } catch (e) {
            console.warn("Token inválido, limpando storage");
            localStorage.removeItem("drive-token");
          }
        }

        // 🔹 Define estado inicial
        const signed = isSignedIn();
        setLogged(signed);

        // 🔹 Escuta mudanças de login
        onSignChange((status) => {
          setLogged(status);
          persistStatus(status);
        });

        // 🔹 Escuta mudanças em outros apps
        channel.onmessage = (e) => {
          if (e.data?.type === "drive-status") {
            setLogged(e.data.logged);
          }
        };
      } catch (err) {
        console.error("Erro ao inicializar Google Drive:", err);
      }
    })();

    return () => {
      mounted = false;
      channel.close();
    };
  }, []);

  // 🧠 Sincroniza status global (para manter login entre abas/apps)
  const persistStatus = (status) => {
    const token = gapi.client.getToken();
    if (status && token) {
      localStorage.setItem("drive-token", JSON.stringify(token));
    } else {
      localStorage.removeItem("drive-token");
    }

    // 🔁 Broadcast
    channel.postMessage({ type: "drive-status", logged: status });
    window.dispatchEvent(
      new CustomEvent("drive:status-change", { detail: { logged: status } })
    );
  };

  // 🔹 Login/Logout
  const login = useCallback(async () => {
    await signIn();
    persistStatus(true);
    setLogged(true);
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    persistStatus(false);
    setLogged(false);
  }, []);

  // 🔹 Backup & Listagem
  const backup = useCallback(async (data) => {
    return uploadFile("propmanager-backup.json", data);
  }, []);

  const files = useCallback(async () => {
    return listFiles();
  }, []);

  // 🔹 Carregar backup existente
  const loadBackup = useCallback(async () => {
    try {
      const files = await listFiles("propmanager-backup.json");
      if (!files?.length) return null;
      const fileId = files[0].id;
      const res = await gapi.client.drive.files.get({ fileId, alt: "media" });
      return JSON.parse(res.body);
    } catch (e) {
      console.error("Erro ao baixar backup:", e);
      return null;
    }
  }, []);

  return (
    <DriveContext.Provider
      value={{
        ready,
        logged,
        login,
        logout,
        backup,
        files,
        loadBackup,
      }}
    >
      {children}
    </DriveContext.Provider>
  );
}

// ✅ Export nomeado compatível com Vite + Fast Refresh
export const useDrive = () => useContext(DriveContext);
