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
  const channel = new BroadcastChannel("drive-sync");

  // ===========================================================
  // 🔹 Inicialização principal do Drive
  // ===========================================================
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const ok = await initGoogleDrive();
        if (!mounted) return;
        if (!ok) console.warn("⚠️ Falha ao inicializar o gapi");
        setReady(true);

        // 🔹 Restaura token local, se houver
        const saved = localStorage.getItem("drive-token");
        if (saved) {
          try {
            gapi.client.setToken(JSON.parse(saved));
            setLogged(true);
          } catch {
            console.warn("Token inválido, limpando storage");
            localStorage.removeItem("drive-token");
          }
        }

        // 🔹 Estado inicial
        const signed = isSignedIn();
        setLogged(signed);

        // 🔹 Escuta mudanças internas no login
        onSignChange((status) => {
          setLogged(status);
          persistStatus(status);
        });

        // 🔹 Escuta mensagens vindas de outro app/aba
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

  // ===========================================================
  // 🔁 Novo: listener global (sincroniza eventos `drive:status-change`)
  // ===========================================================
  useEffect(() => {
    const handleDriveStatus = (e) => {
      const { logged } = e.detail || {};
      if (typeof logged === "boolean") {
        setLogged(logged);
      }
    };
    window.addEventListener("drive:status-change", handleDriveStatus);
    return () => {
      window.removeEventListener("drive:status-change", handleDriveStatus);
    };
  }, []);

  // ===========================================================
  // 🔐 Persistência + Broadcast global de status
  // ===========================================================
  const persistStatus = (status) => {
    const token = gapi.client.getToken();
    if (status && token) {
      localStorage.setItem("drive-token", JSON.stringify(token));
    } else {
      localStorage.removeItem("drive-token");
    }

    // 🔁 Atualiza outros apps/abas
    channel.postMessage({ type: "drive-status", logged: status });
    window.dispatchEvent(
      new CustomEvent("drive:status-change", { detail: { logged: status } })
    );
  };

  // ===========================================================
  // 🔹 Login / Logout (com broadcast imediato)
  // ===========================================================
  const login = useCallback(async () => {
    await signIn();
    persistStatus(true);
    setLogged(true);
    channel.postMessage({ type: "drive-status", logged: true });
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    persistStatus(false);
    setLogged(false);
    channel.postMessage({ type: "drive-status", logged: false });
  }, []);

  // ===========================================================
  // 🔹 Backup / Listagem
  // ===========================================================
  const backup = useCallback(async (data) => {
    return uploadFile("propmanager-backup.json", data);
  }, []);

  const files = useCallback(async () => {
    return listFiles();
  }, []);

  // ===========================================================
  // 🔹 Carregar backup existente
  // ===========================================================
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

  // ===========================================================
  // 🔚 Render
  // ===========================================================
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

// ✅ Export nomeado (compatível com Fast Refresh)
export const useDrive = () => useContext(DriveContext);

// ✅ Export default consistente
export default {
  DriveProvider,
  useDrive,
};
