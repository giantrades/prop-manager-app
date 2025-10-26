import React, {createContext,useContext,useEffect,useState,useCallback,} from "react";
import {initGoogleDrive,signIn,signOut,isSignedIn,uploadFile,listFiles,onSignChange,uploadOrUpdateJSON,downloadLatestJSON, } from "../utils/googleDrive";

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


const savedStatus = localStorage.getItem('drive-logged');
const signed = isSignedIn();

// Se o gapi diz que está logado OU o localStorage indica que está
const actualStatus = signed || savedStatus === 'true';

if (actualStatus && !signed) {
  // Tenta restaurar token do localStorage
  const savedToken = localStorage.getItem('drive-token');
  if (savedToken) {
    try {
      gapi.client.setToken(JSON.parse(savedToken));
      setLogged(true);
      console.log('✅ Token restaurado do localStorage');
    } catch (e) {
      console.warn('⚠️ Token inválido no localStorage');
      localStorage.removeItem('drive-token');
      localStorage.removeItem('drive-logged');
      setLogged(false);
    }
  }
} else {
  setLogged(actualStatus);
}

setInitializing(false);
console.log(`✅ Google Drive inicializado. Logado: ${actualStatus}`);

// Notifica outros apps
if (actualStatus) {
  persistStatus(true);
}

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
// 🔁 NOVO: Listener para mudanças no localStorage (sincroniza entre apps)
// ===========================================================
useEffect(() => {
  const handleStorageChange = (e) => {
    if (e.key === 'drive-logged') {
      const newStatus = e.newValue === 'true';
      console.log('🔄 localStorage mudou, sincronizando:', newStatus);
      setLogged(newStatus);
      
      // Se ficar logado, restaura o token
      if (newStatus) {
        const savedToken = localStorage.getItem('drive-token');
        if (savedToken && gapi?.client) {
          try {
            gapi.client.setToken(JSON.parse(savedToken));
          } catch (e) {
            console.warn('⚠️ Erro ao restaurar token');
          }
        }
      }
    }
  };

  window.addEventListener('storage', handleStorageChange);
  return () => window.removeEventListener('storage', handleStorageChange);
}, []);
  // ===========================================================
  // 🔐 Persistência + Broadcast global de status
  // ===========================================================
const persistStatus = (status) => {
  // Salva no localStorage
  localStorage.setItem('drive-logged', String(status));
  
  // Salva o token se estiver logado
  if (status) {
    const token = gapi?.client?.getToken();
    if (token) {
      localStorage.setItem('drive-token', JSON.stringify(token));
    }
  } else {
    localStorage.removeItem('drive-token');
    localStorage.removeItem('drive-logged');
  }
  
  // Notifica outras abas/apps
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
