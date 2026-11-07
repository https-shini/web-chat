/**
 * Rotas HTTP da porta do WebSocket.
 *
 *  - `GET /`        → 200 "ok"   (checagens de saúde já configuradas em "/"
 *                                  seguem funcionando)
 *  - `GET /healthz` → liveness: o processo responde. Sempre 200 enquanto
 *                     houver event loop para responder.
 *  - `GET /readyz`  → readiness: pronto para aceitar conexões? 200 "ready";
 *                     503 "draining" (desligando) ou "full" (no teto).
 *  - `GET /metrics` → métricas operacionais, só com METRICS_ENABLED=true;
 *                     desligado, responde 404 como qualquer caminho
 *                     desconhecido.
 *  - outros caminhos → 404; outros métodos → 405.
 *
 * Nenhuma rota expõe variáveis de ambiente, configuração, ids de pessoas,
 * nomes ou conteúdo.
 *
 * O upgrade para WebSocket não passa por aqui (o `ws` intercepta antes).
 */

/**
 * @param {{
 *   stats: () => {connections: number, users: number},
 *   readiness?: () => "ready" | "draining" | "full",
 *   metrics?: (() => unknown) | null,
 *   startedAt?: number,
 *   now?: () => number,
 * }} options
 * @returns {(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => void}
 */
export const createHttpHandler = ({
    stats,
    readiness = () => "ready",
    metrics = null,
    startedAt = Date.now(),
    now = Date.now,
}) => {
    const json = (response, status, body) => {
        response.writeHead(status, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
        });
        response.end(JSON.stringify(body));
    };

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
            json(response, 200, {
                status: "ok",
                uptimeSec: Math.floor((now() - startedAt) / 1000),
                connections,
                users,
            });
            return;
        }

        if (pathname === "/readyz") {
            const status = readiness();
            json(response, status === "ready" ? 200 : 503, { status });
            return;
        }

        if (pathname === "/metrics" && metrics) {
            json(response, 200, metrics());
            return;
        }

        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("não encontrado");
    };
};
