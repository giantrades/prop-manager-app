const fs = require('fs');
const path = require('path');

console.log('🚀 Iniciando merge dos builds...');

// Cria diretório dist na raiz
const distDir = path.join(process.cwd(), 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copia main-app para dist/
const mainAppDist = path.join(process.cwd(), 'main-app', 'dist');
if (fs.existsSync(mainAppDist)) {
  const files = fs.readdirSync(mainAppDist);
  files.forEach(file => {
    fs.cpSync(
      path.join(mainAppDist, file),
      path.join(distDir, file),
      { recursive: true }
    );
  });
  console.log('✅ Main app copiado para dist/');
} else {
  console.error('❌ main-app/dist não encontrado!');
  process.exit(1);
}

// Cria dist/journal/ e copia trading-journal
const journalDistDir = path.join(distDir, 'journal');
if (!fs.existsSync(journalDistDir)) {
  fs.mkdirSync(journalDistDir, { recursive: true });
}

const tradingJournalDist = path.join(process.cwd(), 'trading-journal', 'dist');
if (fs.existsSync(tradingJournalDist)) {
  const files = fs.readdirSync(tradingJournalDist);
  files.forEach(file => {
    fs.cpSync(
      path.join(tradingJournalDist, file),
      path.join(journalDistDir, file),
      { recursive: true }
    );
  });
  console.log('✅ Trading journal copiado para dist/journal/');
} else {
  console.error('❌ trading-journal/dist não encontrado!');
  process.exit(1);
}

console.log('🎉 Build merge concluído com sucesso!');