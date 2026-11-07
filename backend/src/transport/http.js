/**
 * Rotas HTTP da porta do WebSocket.
 *
 *  - `GET /`        → 200 "ok"   (comportamento anterior; checagens de saúde
 *                                  já configuradas apontando para "/" seguem
 *                                  funcionando)
 *  - `GET /healthz` → 200 JSON com estado do processo
 *  - outros caminhos → 404; outros métodos → 405
 *
 * O upgrade para WebSocket não passa por aqui (o `ws` intercepta antes).
 */

/**
 * @param {{stats: () => {connections: number, users: number}, startedAt?: number, now?: () => number}} options
 * @returns {(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => void}
 */
export const createHttpHandler = ({ stats, startedAt = Date.now(), now = Date.now }) => {
    return (request, response) => {
        const method = request.method ?? "GET";
        const pathname = (request.url ?? "/").split("?")[0];

        if (method !== "GET" && method !== "HEAD") {
            response.writeHead(405, {
                Allow: "GET, HEAD",
                "Content-Type": "text/plain; charset=utf-8",
            });
            response.end("método não permitido");
            return;
        }

        if (pathname === "/") {
            response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("ok");
            return;
        }

        if (pathname === "/healthz") {
            const { connections, users } = stats();
            response.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
            });
            response.end(
                JSON.stringify({
                    status: "ok",
                    uptimeSec: Math.floor((now() - startedAt) / 1000),
                    connections,
                    users,
                }),
            );
            return;
        }

        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("não encontrado");
    };
};
