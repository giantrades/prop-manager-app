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
  uploadOrUpdateJSON,
  downloadLatestJSON, 
} from "../utils/googleDrive";


const DriveContext = createContext(null);

export function DriveProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [logged, setLogged] = useState(false);
  const channel = new BroadcastChannel("drive-sync");
  const [initializing, setInitializing] = useState(true); 

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


        // 🔹 Estado inicial
        const signed = isSignedIn();
        setLogged(signed);
        // Estado inicial
        setInitializing(false);

        console.log(`✅ Google Drive inicializado. Logado: ${signed}`); // ← ADICIONAR
        // 🔹 Se estiver logado, notifica outros apps imediatamente
        if (signed) {
         persistStatus(true);}

        // 🔹 Escuta mudanças internas no login
        onSignChange((status) => {
          console.log('🔄 Status de login mudou:', status);
          setLogged(status);
          persistStatus(status);
        });

        // 🔹 Escuta mensagens vindas de outro app/aba
        channel.onmessage = (e) => {
          if (e.data?.type === "drive-status") {
            console.log('📡 Sincronizando status entre apps:', e.data.logged);
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
// 🔁 Verificação periódica de sincronização (fallback)
// ===========================================================
useEffect(() => {
  if (!ready) return;

  const interval = setInterval(() => {
    const currentStatus = isSignedIn();
    if (currentStatus !== logged) {
      console.log('🔄 Ressincronizando status:', currentStatus);
      setLogged(currentStatus);
      persistStatus(currentStatus);
    }
  }, 3000); // Verifica a cada 3 segundos

  return () => clearInterval(interval);
}, [ready, logged]);
  // ===========================================================
  // 🔐 Persistência + Broadcast global de status
  // ===========================================================
const persistStatus = (status) => {
  channel.postMessage({ type: "drive-status", logged: status });
  window.dispatchEvent(
    new CustomEvent("drive:status-change", { detail: { logged: status } })
  );
};

  // ===========================================================
  // 🔹 Login / Logout (com broadcast imediato)
  // ===========================================================
  const login = useCallback(async () => {
    
  if (logged) {
    console.log('ℹ️ Já está logado no Google Drive');
    return;
  }
     
  try {
    console.log('🔐 Iniciando login...'); // ← ADICIONAR
    await signIn();
    setLogged(true);
    persistStatus(true);
    console.log('✅ Login realizado com sucesso'); // ← ADICIONAR
  } catch (error) {
    console.error('❌ Erro no login:', error); // ← ADICIONAR
  }
}, [logged]);

  const logout = useCallback(async () => {
    try {
    await signOut();
    setLogged(false);
    persistStatus(false);
    console.log('✅ Logout realizado');
  } catch (error) {
    console.error('❌ Erro no logout:', error);
  }
  }, []);

  // ===========================================================
  // 🔹 Backup / Listagem
  // ===========================================================
const backup = useCallback(async (data) => {
  if (!logged) {
    console.warn('⚠️ Não conectado ao Google Drive - backup ignorado');
    return null;
  }

  try {
    const payload = typeof data === 'string' ? JSON.parse(data) : data;
    await uploadOrUpdateJSON("propmanager-backup.json", payload);
    console.log('✅ Backup salvo no Drive');
    return payload;
  } catch (error) {
    console.error('❌ Erro ao fazer backup:', error);
    throw error;
  }
}, [logged]);

  const files = useCallback(async () => {
    return listFiles();
  }, []);

  // ===========================================================
  // 🔹 Carregar backup existente
  // ===========================================================
const loadBackup = useCallback(async () => {
  if (!logged) {
    console.warn('❌ Você precisa estar conectado ao Google Drive');
    alert('❌ Você precisa estar conectado ao Google Drive');
    return null;
  }

  try {
    const data = await downloadLatestJSON("propmanager-backup.json");
    
    if (!data) {
      alert('ℹ️ Nenhum backup encontrado no Drive');
      return null;
    }

    console.log('✅ Backup carregado do Drive');
    return data;
  } catch (error) {
    console.error('❌ Erro ao baixar backup:', error);
    alert('Erro ao carregar backup do Drive');
    return null;
  }
}, [logged]);

  // ===========================================================
  // 🔚 Render
  // ===========================================================
  return (
    <DriveContext.Provider
      value={{
        ready,
        logged,
        initializing,
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
