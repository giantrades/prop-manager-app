// src/components/RichTextEditor.jsx
import React, { useMemo } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/react/style.css';
import '@blocknote/mantine/style.css';
import '@blocknote/core/fonts/inter.css';
import { uploadImageToDrive, getImageFromDrive } from '@apps/utils/driveImageStorage';

export default function RichTextEditor({ value, onChange, placeholder = "Escreva suas observações..." }) {
  const editor = useCreateBlockNote({
    initialContent: value ? JSON.parse(value) : undefined,
    uploadFile: async (file) => {
      try {
        // Upload da imagem para o Google Drive
        const imageUrl = await uploadImageToDrive(file);
        return imageUrl;
      } catch (error) {
        console.error('Erro ao fazer upload da imagem:', error);
        // Fallback: converte para base64 se falhar o upload
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
      }
    },
  });

  // Salva o conteúdo quando há mudanças
  const handleChange = () => {
    const blocks = editor.document;
    onChange(JSON.stringify(blocks));
  };

  return (
    <div className="rich-text-editor-wrapper">
      <BlockNoteView
        editor={editor}
        onChange={handleChange}
        theme="dark"
        data-theming-css-demo
      />
    </div>
  );''
}