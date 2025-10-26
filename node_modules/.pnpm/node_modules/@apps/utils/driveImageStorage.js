// src/utils/driveImageStorage.js
import { uploadFile, listFiles, downloadFile, isSignedIn } from './googleDrive';

const IMAGES_FOLDER_NAME = 'PropManager_Images';
let imagesFolderId = null;

/**
 * Garante que existe uma pasta de imagens no Drive
 */
async function ensureImagesFolder() {
  if (imagesFolderId) return imagesFolderId;
  
  try {
    // Busca pasta existente
    const response = await gapi.client.drive.files.list({
      q: `name='${IMAGES_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    if (response.result.files && response.result.files.length > 0) {
      imagesFolderId = response.result.files[0].id;
      return imagesFolderId;
    }

    // Cria pasta se não existir
    const createResponse = await gapi.client.drive.files.create({
      resource: {
        name: IMAGES_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder'
      },
      fields: 'id'
    });

    imagesFolderId = createResponse.result.id;
    console.log('✅ Pasta de imagens criada:', imagesFolderId);
    return imagesFolderId;
  } catch (error) {
    console.error('❌ Erro ao criar/buscar pasta de imagens:', error);
    throw error;
  }
}

/**
 * Faz upload de imagem para o Google Drive
 */
export async function uploadImageToDrive(file) {
  if (!isSignedIn()) {
    throw new Error('Usuário não autenticado no Google Drive');
  }

  try {
    const folderId = await ensureImagesFolder();
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;

    // Gera nome único para a imagem
    const timestamp = Date.now();
    const fileName = `${timestamp}_${file.name}`;

    // Lê o arquivo como ArrayBuffer
    const fileData = await file.arrayBuffer();
    const base64Data = btoa(
      new Uint8Array(fileData).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    const metadata = {
      name: fileName,
      mimeType: file.type,
      parents: [folderId]
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${file.type}\r\n` +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      base64Data +
      closeDelim;

    const response = await gapi.client.request({
      path: '/upload/drive/v3/files',
      method: 'POST',
      params: { uploadType: 'multipart' },
      headers: {
        'Content-Type': `multipart/related; boundary="${boundary}"`
      },
      body: multipartRequestBody
    });

    const fileId = response.result.id;
    
    // Torna o arquivo público para leitura
    await gapi.client.drive.permissions.create({
      fileId: fileId,
      resource: {
        type: 'anyone',
        role: 'reader'
      }
    });

    // Retorna URL da imagem
    const imageUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    console.log('✅ Imagem enviada:', imageUrl);
    
    return imageUrl;
  } catch (error) {
    console.error('❌ Erro ao fazer upload da imagem:', error);
    throw error;
  }
}

/**
 * Lista todas as imagens da pasta
 */
export async function listImagesFromDrive() {
  if (!isSignedIn()) return [];

  try {
    const folderId = await ensureImagesFolder();
    
    const response = await gapi.client.drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, thumbnailLink, webContentLink, createdTime)',
      orderBy: 'createdTime desc'
    });

    return response.result.files || [];
  } catch (error) {
    console.error('❌ Erro ao listar imagens:', error);
    return [];
  }
}

/**
 * Deleta imagem do Drive
 */
export async function deleteImageFromDrive(fileId) {
  if (!isSignedIn()) {
    throw new Error('Usuário não autenticado');
  }

  try {
    await gapi.client.drive.files.delete({
      fileId: fileId
    });
    console.log('✅ Imagem deletada:', fileId);
  } catch (error) {
    console.error('❌ Erro ao deletar imagem:', error);
    throw error;
  }
}

/**
 * Obtém URL de visualização da imagem
 */
export function getImageFromDrive(fileId) {
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}