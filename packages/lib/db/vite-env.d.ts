// Declarações de ambiente do pacote lib (padrões do Vite que o tsc não conhece).
declare module '*?url' {
  const src: string;
  export default src;
}
