// @ts-check

/**
 * Link de convite de uma sala: `…/#/s/abc-defg-hij`.
 *
 * O código vai no fragmento (depois do `#`) de propósito: o navegador não
 * envia o fragmento a servidor nenhum — nem ao que serve a página, nem em
 * cabeçalho `Referer` — então o código não aparece em log de hospedagem.
 * O servidor do chat confere o código de novo; isto aqui só lê e escreve.
 */

const GROUPS = [3, 4, 3];
const LENGTH = GROUPS.reduce((sum, size) => sum + size, 0);

/**
 * Código canônico `abc-defg-hij` a partir do que alguém digitou ou colou
 * (com ou sem hífens, maiúsculas, espaços), ou null se não tiver o formato.
 * @param {unknown} raw
 * @returns {string | null}
 */
export const normalizeRoomCode = (raw) => {
    if (typeof raw !== "string" || raw.length > 200) return null;
    const tail =
        raw
            .trim()
            .split(/[/#?=]/)
            .filter(Boolean)
            .at(-1) ?? "";
    const letters = tail.toLowerCase().replace(/[\s-]/g, "");
    if (letters.length !== LENGTH || !/^[a-z]+$/.test(letters)) return null;
    const parts = [];
    let start = 0;
    for (const size of GROUPS) {
        parts.push(letters.slice(start, start + size));
        start += size;
    }
    return parts.join("-");
};

/**
 * Código do convite no fragmento da página (`#/s/abc-defg-hij`), ou null.
 * @param {string} hash `location.hash`
 */
export const readInviteHash = (hash) => {
    const match = /^#\/s\/([^/?#]+)$/.exec(hash);
    return match?.[1] ? normalizeRoomCode(decodeURIComponent(match[1])) : null;
};

/**
 * Fragmento do convite para um código.
 * @param {string} code
 */
export const inviteHash = (code) => `#/s/${code}`;
