// src/utils/googleDrive.js

// 🔹 Suas chaves
const DEFAULT_CLIENT_ID = "466867392278-f22vqhvgre89q3e8bvbi4je8vovnc92n.apps.googleusercontent.com";
const DEFAULT_API_KEY   = "AIzaSyCYWpRFtpOjjZym0UhKQIN3zU7-y557E9M";

// 🔹 Config Google Drive
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.file";

let tokenClient;
let gapiInited = false;
let gisInited = false;

// 🔹 Inicializa a API
export function initGoogleDrive(clientId = DEFAULT_CLIENT_ID, apiKey = DEFAULT_API_KEY) {
  return new Promise((resolve, reject) => {
    gapi.load("client", async () => {
      try {
        await gapi.client.init({
          apiKey,
          discoveryDocs: DISCOVERY_DOCS,
        });
        gapiInited = true;

        // Inicializa o cliente de token (GIS)
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPES,
          callback: (resp) => {
            if (resp.error) reject(resp);
            else resolve(resp);
          },
        });

        gisInited = true;
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

// 🔹 Verifica se está logado (se tem token válido)
export function isSignedIn() {
  return !!gapi.client.getToken();
}

// 🔹 Listener (simulando o antigo)
export function onSignChange(callback) {
  // GIS não tem listener nativo → checamos manualmente
  window.addEventListener("gapi-token-change", () => {
    callback(isSignedIn());
  });
}

// 🔹 Login
export function signIn() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject("TokenClient não inicializado");
    tokenClient.callback = (resp) => {
      if (resp.error) reject(resp);
      else {
        // dispara evento fake para apps que usam listener
        window.dispatchEvent(new Event("gapi-token-change"));
        resolve(resp);
      }
    };
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

// 🔹 Logout
export function signOut() {
  const token = gapi.client.getToken();
  if (token) {
    google.accounts.oauth2.revoke(token.access_token, () => {
      gapi.client.setToken("");
      window.dispatchEvent(new Event("gapi-token-change"));
      console.log("Token revogado.");
    });
  }
}

// 🔹 Upload simples
export async function uploadFile(name, content) {
  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metadata = {
    name,
    mimeType: "application/json",
  };

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(content) +
    closeDelim;

  const request = gapi.client.request({
    path: "/upload/drive/v3/files",
    method: "POST",
    params: { uploadType: "multipart" },
    headers: { "Content-Type": `multipart/related; boundary="${boundary}"` },
    body: multipartRequestBody,
  });

  return request;
}

// 🔹 Lista arquivos JSON
export async function listFiles() {
  const response = await gapi.client.drive.files.list({
    pageSize: 10,
    fields: "files(id, name, modifiedTime)",
    q: "mimeType='application/json'",
    orderBy: "modifiedTime desc",
  });
  return response.result.files;
}

// 🔹 Download de um arquivo pelo ID
export async function downloadFile(fileId) {
  const response = await gapi.client.drive.files.get({
    fileId,
    alt: "media",
  });
  return response.result;
}

// 🔹 Pega o JSON mais recente
export async function downloadLatestJSON(filename = 'propmanager-backup.json') {
  // Procurar pelo arquivo com o nome exato (evita pegar qualquer JSON)
  try {
    const response = await gapi.client.drive.files.list({
      q: `name='${filename.replace(/'/g, "\\'")}' and mimeType='application/json' and trashed=false`,
      pageSize: 5,
      fields: 'files(id,name,modifiedTime)',
      orderBy: 'modifiedTime desc'
    });

    const files = response.result.files || [];
    if (!files.length) return null;
    // usamos o mais recente (já ordenado)
    const fileId = files[0].id;
    const dl = await gapi.client.drive.files.get({ fileId, alt: 'media' });
    return dl.result;
  } catch (err) {
    console.error('downloadLatestJSON error:', err);
    throw err;
  }
}

// 🔹 Upload ou atualização de JSON
export async function uploadOrUpdateJSON(name, content) {
  const response = await gapi.client.drive.files.list({
    q: `name='${name}' and mimeType='application/json'`,
    fields: "files(id, name)",
  });

  if (response.result.files && response.result.files.length > 0) {
    const fileId = response.result.files[0].id;
    const updateResponse = await gapi.client.request({
      path: `/upload/drive/v3/files/${fileId}`,
      method: "PATCH",
      params: { uploadType: "media" },
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
    return updateResponse;
  } else {
    return uploadFile(name, content);
  }
}

export async function backupToDrive() {
  const LS_KEY = "propmanager-data-v1";
  try {
    const data = localStorage.getItem(LS_KEY);
    if (!data) {
      const msg = `Nenhum dado encontrado na chave localStorage '${LS_KEY}'.`;
      console.warn('[googleDrive] backupToDrive:', msg);
      alert(msg);
      return { success: false, message: msg };
    }
    // tenta parse apenas para validar antes de enviar
    let parsed;
    try { parsed = JSON.parse(data); } catch (e) {
      console.error('[googleDrive] backupToDrive: localStorage não é JSON válido', e);
      alert('Erro: dados locais não são JSON válido. Backup abortado.');
      return { success: false, message: 'LocalStorage não é JSON válido.' };
    }

    // utiliza sua função existente uploadOrUpdateJSON (que opera com objeto JSON)
    const result = await uploadOrUpdateJSON("propmanager-backup.json", parsed);
    console.info('[googleDrive] backupToDrive success', result);
    alert("Backup enviado para o Google Drive com sucesso ✅");
    // retorna meta para UI/integracão
    return { success: true, message: 'Backup enviado', meta: result };
  } catch (err) {
    console.error('Erro no backupToDrive:', err);
    alert('Erro ao enviar backup para o Google Drive ❌\n' + (err.message || err));
    return { success: false, message: err.message || String(err) };
  }
}


// 🔹 Restaura os dados do backup mais recente
export async function restoreFromDrive({ filename = 'propmanager-backup.json' } = {}) {
  const LS_KEY = "propmanager-data-v1";
  try {
    const latest = await downloadLatestJSON(filename);
    if (!latest) {
      const msg = 'Nenhum backup encontrado no Drive com o nome "' + filename + '".';
      console.warn('[googleDrive] restoreFromDrive:', msg);
      alert(msg);
      return { success: false, message: msg };
    }

    // Se a API devolver objeto JS já parseado (gapi retorna objeto), aceitamos.
    const payload = typeof latest === 'string' ? JSON.parse(latest) : latest;

    // SUBSTITUIR (sobrescrever) conforme sua preferência
    localStorage.setItem(LS_KEY, JSON.stringify(payload));

    // IMPORTANTE: disparar event para UI reagir automaticamente
    try {
      window.dispatchEvent(new CustomEvent('datastore:change', { detail: { source: 'googleDrive.restore', timestamp: Date.now() } }));
    } catch (e) {
      console.warn('Não foi possível disparar datastore:change após restore', e);
    }

    alert("Backup restaurado com sucesso ✅ (localStorage substituído).");
    return { success: true, message: 'Restore concluído', data: payload };
  } catch (err) {
    console.error('Erro no restoreFromDrive:', err);
    alert('Erro ao restaurar dados do Google Drive ❌\n' + (err.message || err));
    return { success: false, message: err.message || String(err) };
  }
}