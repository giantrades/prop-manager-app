import React, { createContext, useContext, useEffect, useState, useCallback, } from "react";
import { initGoogleDrive, signIn, signOut, isSignedIn, uploadFile, listFiles, onSignChange, uploadOrUpdateJSON, downloadLatestJSON, } from "../utils/googleDrive";
import {
  loginProtonDrive,
  logoutProtonDrive,
  isProtonDriveLogged,
  backupToProtonDrive,
  restoreFromProtonDrive,
  ensureProtonPermission,
  isFileSystemAccessSupported,
  downloadBackupFile,
} from "../utils/protonDrive";

const DriveContext = createContext(null);

export function DriveProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [logged, setLogged] = useState(false);
  const channel = new BroadcastChannel("drive-sync");
  const [initializing, setInitializing] = useState(true);

  const [protonLogged, setProtonLogged] = useState(false);
  // Detecta uma única vez se o navegador suporta a File System Access API
  const [protonSupported] = useState(() => isFileSystemAccessSupported());

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

  // Inicialização do Proton Drive
  useEffect(() => {
    console.log(`✅ Proton Drive suportado: ${protonSupported}`);
    if (!protonSupported) {
      // Navegador sem suporte: nunca haverá "conexão" de pasta real
      setProtonLogged(false);
      console.log('✅ Proton Drive logado: false');
      return;
    }
    isProtonDriveLogged().then(status => {
      setProtonLogged(status);
      console.log(`✅ Proton Drive logado: ${status}`);
    });
  }, [protonSupported]);

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
      console.log('🔐 Iniciando login...');
      await signIn();
      setLogged(true);
      persistStatus(true);
      console.log('✅ Login realizado com sucesso');
    } catch (error) {
      console.error('❌ Erro no login:', error);
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

  const protonLogin = useCallback(async () => {
    if (!protonSupported) {
      alert('⚠️ Seu navegador não suporta conexão direta com pastas locais (isso funciona em Chrome, Edge ou Opera). Você ainda pode usar o Proton Drive: cada clique em "Backup" vai baixar o arquivo, que você move manualmente para a pasta Trading Management > PropManager do Proton Drive.');
      return;
    }
    try {
      const success = await loginProtonDrive();
      if (success === true) {
        setProtonLogged(true);
        console.log('✅ Proton Drive login realizado com sucesso');
      }
    } catch (error) {
      console.error('❌ Erro no login do Proton Drive:', error);
    }
  }, [protonSupported]);

  const protonLogout = useCallback(async () => {
    try {
      const success = await logoutProtonDrive();
      if (success) {
        setProtonLogged(false);
        console.log('✅ Proton Drive logout realizado');
      }
    } catch (error) {
      console.error('❌ Erro no logout do Proton Drive:', error);
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

  const backupToProton = useCallback(async (data) => {
    const payload = typeof data === 'string' ? JSON.parse(data) : data;

    // Navegador sem suporte: baixa o arquivo direto, sem exigir "conexão" prévia
    if (!protonSupported) {
      downloadBackupFile(payload);
      console.log('⬇️ Backup do Proton baixado (navegador sem suporte à pasta local)');
      return payload;
    }

    if (!protonLogged) {
      console.warn('⚠️ Não conectado ao Proton Drive - backup ignorado');
      return null;
    }
    try {
      const permOk = await ensureProtonPermission();
      if (!permOk) {
        console.warn('Permissão negada para o Proton Drive');
        return null;
      }
      await backupToProtonDrive(payload);
      console.log('✅ Backup salvo no Proton Drive');
      return payload;
    } catch (error) {
      console.error('❌ Erro ao fazer backup no Proton Drive:', error);
      throw error;
    }
  }, [protonLogged, protonSupported]);

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

  const loadProtonBackup = useCallback(async () => {
    if (!protonSupported) {
      alert('⚠️ Seu navegador não suporta restaurar diretamente da pasta local do Proton Drive.');
      return null;
    }
    if (!protonLogged) {
      alert('❌ Você precisa estar conectado ao Proton Drive (Pasta local)');
      return null;
    }
    try {
      const data = await restoreFromProtonDrive();
      if (!data) {
        alert('ℹ️ Nenhum backup encontrado na pasta do Proton Drive');
        return null;
      }
      console.log('✅ Backup carregado do Proton Drive');
      return data;
    } catch (error) {
      console.error('❌ Erro ao baixar backup do Proton:', error);
      alert('Erro ao carregar backup do Proton Drive');
      return null;
    }
  }, [protonLogged, protonSupported]);

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
        protonLogged,
        protonSupported,
        protonLogin,
        protonLogout,
        backupToProton,
        loadProtonBackup,
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