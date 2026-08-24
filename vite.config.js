import { defineConfig } from "vite";

// O frontend é a raiz do Vite: index.html vive em frontend/, os módulos em
// frontend/src/ e os estáticos em frontend/public/.
export default defineConfig({
    root: "frontend",
    publicDir: "public",
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        target: "es2022",
    },
    server: {
        port: 5173,
        open: false,
    },
});
