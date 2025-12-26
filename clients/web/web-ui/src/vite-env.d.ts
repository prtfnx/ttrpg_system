/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

// Extend Window interface for WASM integration
declare global {
  interface Window {
    rustRenderManager?: {
      load_texture: (name: string, image: HTMLImageElement) => void;
    };
    gameAPI?: any;
  }
}
