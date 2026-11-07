// @ts-check

/**
 * Validação do endereço do servidor de tempo real. Usada em dois lugares:
 * no build (`vite.config.js`, que recusa um `VITE_SOCKET_URL` inválido antes
 * de gerar um bundle que nunca conectaria) e no navegador (`config.js`).
 * Sem DOM e sem `import.meta.env`, para rodar nos dois ambientes.
 */

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export const isSocketUrl = (value) => {
    if (typeof value !== "string" || value.trim() !== value || value === "") return false;
    try {
        const url = new URL(value);
        return (url.protocol === "ws:" || url.protocol === "wss:") && url.hostname !== "";
    } catch {
        return false;
    }
};
