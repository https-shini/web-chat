/**
 * Balde de fichas. Cada chamada consome uma ficha; as fichas voltam a
 * `refillPerSecond` por segundo até `capacity`. Devolve `false` quando não
 * há ficha — quem chama decide se descarta ou avisa.
 *
 * @param {{capacity: number, refillPerSecond: number, now?: () => number}} options
 * @returns {() => boolean}
 */
export const createRateLimiter = ({ capacity, refillPerSecond, now = Date.now }) => {
    let tokens = capacity;
    let lastRefill = now();
    return () => {
        const time = now();
        tokens = Math.min(capacity, tokens + ((time - lastRefill) / 1000) * refillPerSecond);
        lastRefill = time;
        if (tokens < 1) return false;
        tokens -= 1;
        return true;
    };
};
