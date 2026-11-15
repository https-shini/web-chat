// @ts-check

/**
 * Endereço antigo → domínio próprio.
 *
 * Com `VITE_PUBLIC_URL` definida no build (ex.: https://webchat.gcruz.dev.br),
 * quem abre o site pelo endereço do Render (*.onrender.com) é levado ao mesmo
 * caminho, query e fragmento no domínio próprio — um convite `#/s/código`
 * continua valendo. Sem a variável, ou em qualquer outro host (o próprio
 * domínio, localhost, um preview), nada acontece.
 *
 * Um site estático do Render não tem redirecionamento por host; por isso o
 * redirecionamento é feito aqui, no primeiro módulo carregado por `main.js`.
 */

/**
 * @param {{ hostname: string, pathname: string, search: string, hash: string }} location
 * @param {unknown} publicUrl
 * @returns {string | null} URL de destino, ou null quando não há o que redirecionar.
 */
export const publicRedirect = (location, publicUrl) => {
    if (typeof publicUrl !== "string" || publicUrl === "") return null;
    let target;
    try {
        target = new URL(publicUrl);
    } catch {
        return null;
    }
    if (target.protocol !== "https:" && target.protocol !== "http:") return null;
    const host = location.hostname.toLowerCase();
    if (!host.endsWith(".onrender.com") || host === target.hostname) return null;
    return `${target.origin}${location.pathname}${location.search}${location.hash}`;
};

const destination =
    typeof window === "undefined"
        ? null
        : publicRedirect(window.location, import.meta.env?.VITE_PUBLIC_URL);
if (destination) window.location.replace(destination);
