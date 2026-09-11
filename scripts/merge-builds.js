const fs = require('fs');
const path = require('path');

console.log('🚀 Iniciando merge dos builds...');

// Cria diretório dist na raiz e LIMPA antes (não deixa artefato antigo sobrando).
const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
  console.log('🧹 dist/ limpo');
}
fs.mkdirSync(distDir, { recursive: true });

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

console.log('🎉 Build merge concluído com sucesso! (trading-journal aposentado — SPA única)');