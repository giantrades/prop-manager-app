// vite-env.d.ts (ou vite.d.ts)

/// <reference types="vite/client" />

// 💥 Adicione esta declaração para que o TypeScript reconheça a sintaxe '?worker'
declare module '*?worker' {
  class WebpackWorker extends Worker {
    constructor();
  }
  export default WebpackWorker;
}