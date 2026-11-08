// Apoio dos testes: username automático para quem não está testando username.
//
// Desde a Fase A toda entrada nova exige um username único. A maioria dos
// testes trata de outra coisa (mensagens, comandos, conexões) e entra só
// com o nome; para eles, um username válido e único é derivado do nome.
// Quem testa o próprio username declara a chave no payload — inclusive
// `username: undefined`, para testar a ausência — e então nada é preenchido.

let counter = 0;

/**
 * Username válido derivado do nome: minúsculo, sem acento, com sufixo
 * sequencial para nunca colidir dentro do mesmo processo de teste.
 * @param {unknown} name
 */
export const usernameFor = (name) => {
    counter += 1;
    const base = String(name ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 12);
    return `${base || "u"}_${counter.toString(36)}`;
};

/**
 * Acrescenta `username` ao payload de login, a menos que o teste já tenha
 * declarado a chave.
 * @param {unknown} payload
 */
export const withUsername = (payload) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
    if (Object.hasOwn(payload, "username")) return payload;
    return { ...payload, username: usernameFor(/** @type {any} */ (payload).userName) };
};
