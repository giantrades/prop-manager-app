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
export async function downloadLatestJSON() {
  const files = await listFiles();
  if (!files || files.length === 0) return null;
  return downloadFile(files[0].id);
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
