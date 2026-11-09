/**
 * Proteção contra adivinhar códigos de convite.
 *
 * Um código tem 26¹⁰ (≈ 1,4 × 10¹⁴) combinações; o que torna a adivinhação
 * inviável é limitar quantas tentativas ERRADAS cabem por unidade de tempo:
 *
 *  - por identidade: um balde pequeno, que recarrega devagar. Quem erra o
 *    código algumas vezes por engano não percebe; quem varre códigos é
 *    travado em segundos;
 *  - no servidor inteiro: um balde maior, para quem abre identidades novas
 *    só para recomeçar a contagem. Com ele esgotado, TODA entrada por código
 *    é recusada por um instante — inclusive com código certo. Responder
 *    "entrou" para o código certo nesse momento seria justamente o oráculo
 *    que o limite quer negar.
 *
 * Só erros consomem o balde: entrar com o código certo não custa nada.
 * Com o padrão (5 erros por segundo no servidor), varrer o espaço para
 * achar uma entre 500 salas levaria, em média, mais de 800 anos.
 */

/** Padrões; `createChatServer` pode trocá-los (testes). */
export const JOIN_GUARD_DEFAULTS = Object.freeze({
    perIdentity: Object.freeze({ capacity: 10, refillPerSecond: 1 / 30 }),
    global: Object.freeze({ capacity: 100, refillPerSecond: 5 }),
});

/**
 * Balde que só é consumido por erro, com consulta sem consumo.
 * @param {{capacity: number, refillPerSecond: number}} rule
 * @param {() => number} now
 */
const createFailureBucket = ({ capacity, refillPerSecond }, now) => {
    let tokens = capacity;
    let last = now();
    const refill = () => {
        const time = now();
        tokens = Math.min(capacity, tokens + ((time - last) / 1000) * refillPerSecond);
        last = time;
    };
    return {
        available() {
            refill();
            return tokens >= 1;
        },
        spend() {
            refill();
            tokens = Math.max(0, tokens - 1);
        },
    };
};

/**
 * @param {{
 *   perIdentity?: {capacity: number, refillPerSecond: number},
 *   global?: {capacity: number, refillPerSecond: number},
 *   now?: () => number,
 * }} [options]
 */
export const createJoinGuard = ({
    perIdentity = JOIN_GUARD_DEFAULTS.perIdentity,
    global = JOIN_GUARD_DEFAULTS.global,
    now = Date.now,
} = {}) => {
    const shared = createFailureBucket(global, now);
    /** Baldes por identidade; somem junto com a identidade. @type {WeakMap<object, ReturnType<typeof createFailureBucket>>} */
    const buckets = new WeakMap();
    /** @param {object} identity */
    const bucketOf = (identity) => {
        let bucket = buckets.get(identity);
        if (!bucket) {
            bucket = createFailureBucket(perIdentity, now);
            buckets.set(identity, bucket);
        }
        return bucket;
    };

    return {
        /**
         * Pode tentar agora? Consulta sem consumir.
         * @param {object} identity
         */
        allows: (identity) => bucketOf(identity).available() && shared.available(),

        /**
         * Registra uma tentativa errada (código mal formado ou inexistente).
         * @param {object} identity
         */
        fail(identity) {
            bucketOf(identity).spend();
            shared.spend();
        },
    };
};
