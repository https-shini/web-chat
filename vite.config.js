import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { isSocketUrl } from "./frontend/src/socketUrl.js";

// Raiz do repositório: é onde mora o `.env` documentado (ver `.env.example`).
const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const frontendDir = fileURLToPath(new URL("./frontend/", import.meta.url));

// O frontend é a raiz do Vite: index.html vive em frontend/, os módulos em
// frontend/src/ e os estáticos em frontend/public/.
export default defineConfig(({ mode }) => {
    // Sem `envDir`, o Vite procura `.env` na própria raiz (`frontend/`) e o
    // `.env` da raiz do repositório era ignorado em silêncio (P03). Só as
    // variáveis com prefixo `VITE_` chegam ao bundle — `ALLOWED_ORIGINS` e
    // demais variáveis do servidor no mesmo arquivo nunca são expostas.
    const env = loadEnv(mode, projectRoot, "VITE_");

    // Um endereço inválido geraria um bundle que nunca conecta; melhor
    // falhar aqui, com a causa, do que em produção sem explicação.
    if (env.VITE_SOCKET_URL && !isSocketUrl(env.VITE_SOCKET_URL)) {
        throw new Error(
            `VITE_SOCKET_URL inválida: "${env.VITE_SOCKET_URL}". ` +
                "Use um endereço ws:// ou wss:// (ex.: wss://chat.exemplo.com).",
        );
    }

    // `frontend/.env` era o contorno documentado enquanto o `.env` da raiz não
    // funcionava. Ele deixou de ser lido: avisar em vez de ignorar calado.
    const legacy = readdirSync(frontendDir).filter((name) => name.startsWith(".env"));
    if (legacy.length > 0) {
        console.warn(
            `[web-chat] ${legacy.map((name) => `frontend/${name}`).join(", ")} não é mais lido. ` +
                "Mova as variáveis para o .env da raiz do repositório.",
        );
    }

    return {
        root: "frontend",
        envDir: projectRoot,
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
    };
});
