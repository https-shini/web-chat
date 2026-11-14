/**
 * Métricas operacionais em memória — sem dependência e sem plataforma externa.
 *
 * Contadores são cumulativos desde o início do processo. Rótulos têm
 * cardinalidade fechada (tipos de evento do protocolo, códigos de erro do
 * catálogo, motivos fixos): nenhum valor vindo do cliente vira chave, então
 * um atacante não consegue inflar o mapa.
 *
 * Expostas de duas formas, ambas sem dado pessoal, conteúdo ou configuração:
 *  - linha de log `metrics` periódica (METRICS_LOG_INTERVAL_MS);
 *  - GET /metrics, só com METRICS_ENABLED=true.
 */

import { monitorEventLoopDelay } from "node:perf_hooks";

/** Limites (ms) do histograma do tempo de processamento de um quadro. */
const PROCESSING_BUCKETS_MS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100];

const round = (value, digits = 2) => Number(value.toFixed(digits));

/**
 * @param {{now?: () => number, startedAt?: number}} [options]
 */
export const createMetrics = ({ now = () => Date.now(), startedAt = Date.now() } = {}) => {
    /** @type {Record<string, number | Record<string, number>>} */
    const counters = {
        connectionsOpened: 0,
        connectionsClosed: 0,
        connectionsRejected: {},
        heartbeatTimeouts: 0,
        loginTimeouts: 0,
        logouts: 0,
        slowConsumerDisconnects: 0,
        framesReceived: {},
        invalidFrames: {},
        messagesAccepted: 0,
        requestsRejected: {},
        errorsByCategory: {},
        userListBroadcasts: 0,
        commandsExecuted: {},
        commandsRejected: {},
        // Salas (Fase 2 da evolução)
        roomsCreated: 0,
        roomJoins: 0,
        roomLeaves: 0,
        // Conversas privadas (Fase 3 da evolução)
        userLookups: 0,
        dmsOpened: 0,
        dmsClosed: 0,
        blocks: 0,
        // Recursos de mensagem (editar, apagar, reagir, fixar, descrição)
        messageActions: {},
    };

    const buckets = new Array(PROCESSING_BUCKETS_MS.length + 1).fill(0);
    let processingCount = 0;
    let processingSumMs = 0;
    let processingMaxMs = 0;

    const loopDelay = monitorEventLoopDelay({ resolution: 20 });
    loopDelay.enable();

    let cpuMark = process.cpuUsage();
    let cpuMarkAt = now();

    return {
        /**
         * @param {string} name contador
         * @param {string} [label] rótulo (cardinalidade fechada)
         */
        count(name, label) {
            if (label === undefined) {
                counters[name] = /** @type {number} */ (counters[name]) + 1;
                return;
            }
            const group = /** @type {Record<string, number>} */ (counters[name]);
            group[label] = (group[label] ?? 0) + 1;
        },

        /** Tempo de processamento de um quadro recebido, em ms. */
        observeProcessing(ms) {
            processingCount += 1;
            processingSumMs += ms;
            if (ms > processingMaxMs) processingMaxMs = ms;
            const index = PROCESSING_BUCKETS_MS.findIndex((limit) => ms <= limit);
            buckets[index === -1 ? buckets.length - 1 : index] += 1;
        },

        /**
         * Fotografia atual. `reset` zera as janelas (CPU, atraso do event
         * loop, máximo de processamento) — usado pelo log periódico, para que
         * cada linha descreva o intervalo desde a anterior.
         * @param {{connections: number, users: number, identities: number, rooms?: number, dms?: number}} gauges
         * @param {{reset?: boolean}} [options]
         */
        snapshot(gauges, { reset = false } = {}) {
            const time = now();
            const cpu = process.cpuUsage(cpuMark);
            const elapsedMs = Math.max(1, time - cpuMarkAt);
            const memory = process.memoryUsage();

            // p95 aproximado pelo histograma: limite do balde que cruza 95 %.
            let accumulated = 0;
            let p95 = null;
            for (let index = 0; index < buckets.length; index += 1) {
                accumulated += buckets[index];
                if (processingCount > 0 && accumulated >= processingCount * 0.95) {
                    p95 = PROCESSING_BUCKETS_MS[index] ?? `>${PROCESSING_BUCKETS_MS.at(-1)}`;
                    break;
                }
            }

            const result = {
                uptimeSec: Math.floor((time - startedAt) / 1000),
                gauges,
                counters: structuredClone(counters),
                processing: {
                    frames: processingCount,
                    avgMs: processingCount ? round(processingSumMs / processingCount, 3) : 0,
                    p95Ms: p95,
                    maxMs: round(processingMaxMs, 3),
                },
                eventLoopDelayMs: {
                    p50: round(loopDelay.percentile(50) / 1e6),
                    p99: round(loopDelay.percentile(99) / 1e6),
                    max: round(loopDelay.max / 1e6),
                },
                process: {
                    cpuPercent: round(((cpu.user + cpu.system) / 1000 / elapsedMs) * 100, 1),
                    rssMb: round(memory.rss / 1048576, 1),
                    heapUsedMb: round(memory.heapUsed / 1048576, 1),
                    externalMb: round(memory.external / 1048576, 1),
                },
            };

            if (reset) {
                cpuMark = process.cpuUsage();
                cpuMarkAt = time;
                loopDelay.reset();
                processingMaxMs = 0;
            }
            return result;
        },

        /** Para o monitor do event loop (desligamento). */
        stop() {
            loopDelay.disable();
        },
    };
};
