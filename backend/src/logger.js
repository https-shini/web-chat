/**
 * Log estruturado: uma linha JSON por evento (`ts`, `level`, `event`, campos).
 *
 * Proteção contra log injection (Fase 1, P04): `JSON.stringify` escapa \n, \r
 * e todo caractere de controle, então nenhum valor vindo do cliente consegue
 * forjar uma linha independente.
 *
 * Defesa em profundidade: campos cujo nome indica dado sensível são
 * substituídos antes de escrever, mesmo que um chamador os passe por engano.
 * A regra do projeto continua sendo não passá-los — conteúdo de mensagem,
 * nome de usuário e token de sessão nunca vão para o log.
 */

const REDACTED_KEYS = new Set([
    "content",
    "name",
    "userName",
    "token",
    "resumeToken",
    "password",
    "secret",
]);

const redact = (fields) => {
    const safe = {};
    for (const [key, value] of Object.entries(fields)) {
        safe[key] = REDACTED_KEYS.has(key) ? "[omitido]" : value;
    }
    return safe;
};

/**
 * @param {{out?: (line: string) => void, err?: (line: string) => void, now?: () => Date}} [sinks]
 * @returns {(level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void}
 */
export const createLogger = ({
    out = (line) => console.log(line),
    err = (line) => console.error(line),
    now = () => new Date(),
} = {}) => {
    return (level, event, fields = {}) => {
        const line = JSON.stringify({ ts: now().toISOString(), level, event, ...redact(fields) });
        if (level === "info") out(line);
        else err(line);
    };
};
