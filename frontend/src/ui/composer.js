// @ts-check

import { LIMITS } from "../config.js";
import { format, strings } from "../i18n/strings.js";
import { must } from "./dom.js";

/**
 * Campo de mensagem (composer), com o comportamento dos chats modernos
 * (Fluxer/Discord), implementado aqui:
 *
 * - área de texto que cresce com o conteúdo até ~40% da conversa e depois
 *   rola por dentro; volta a uma linha depois do envio;
 * - Enter envia; Shift+Enter quebra a linha. No toque (teclado virtual),
 *   Enter quebra a linha e o botão envia. Ctrl/⌘+Enter envia sempre;
 * - formatação na seleção: Ctrl/⌘ B, I, E e os botões da barra (negrito,
 *   itálico, código, spoiler) envolvem o texto selecionado com a marcação;
 * - contador a partir de 800 de 1000 caracteres; colar além do limite
 *   avisa em vez de cortar em silêncio;
 * - o campo continua editável quando a conexão cai: o envio vai para a fila
 *   e o aviso diz isso.
 *
 * O texto é sempre texto: nada de HTML. O rascunho por conversa, a
 * devolução do texto recusado e a deduplicação ficam com quem chama.
 */

/**
 * Marcação de cada botão de formatação.
 * @type {Readonly<Record<"bold" | "italic" | "code" | "spoiler", readonly [string, string]>>}
 */
const MARKS = Object.freeze({
    bold: ["**", "**"],
    italic: ["*", "*"],
    code: ["`", "`"],
    spoiler: ["||", "||"],
});

/** Contador aparece a partir daqui. */
const COUNT_FROM = 800;

/** No toque, Enter quebra a linha (padrão do celular). */
const touch = () => window.matchMedia("(pointer: coarse)").matches;

/**
 * Envolve a seleção de `value` (de `start` a `end`) com a marcação. Sem
 * seleção, insere o par e põe o cursor no meio. Seleção já envolvida pela
 * mesma marcação: tira a marcação (alterna).
 * @param {string} value
 * @param {number} start
 * @param {number} end
 * @param {readonly [string, string]} mark
 * @returns {{value: string, start: number, end: number}}
 */
export const wrapSelection = (value, start, end, [open, close]) => {
    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const after = value.slice(end);
    if (before.endsWith(open) && after.startsWith(close) && selected) {
        return {
            value: before.slice(0, -open.length) + selected + after.slice(close.length),
            start: start - open.length,
            end: end - open.length,
        };
    }
    return {
        value: before + open + selected + close + after,
        start: start + open.length,
        end: end + open.length,
    };
};

/**
 * @param {{
 *   onSend: (content: string) => void,
 *   onTyping: () => void,
 *   onInput?: (text: string, cursor: number) => void,
 *   onKeyDown?: (event: KeyboardEvent) => boolean,
 *   onCommands?: () => void,
 *   onNotice?: (text: string) => void,
 * }} handlers
 */
export const createComposer = ({
    onSend,
    onTyping,
    onInput = () => {},
    onKeyDown = () => false,
    onCommands = () => {},
    onNotice = () => {},
}) => {
    const footer = /** @type {HTMLElement} */ (must(".c-composer-area"));
    const form = /** @type {HTMLFormElement} */ (must(".c-composer"));
    const input = /** @type {HTMLTextAreaElement} */ (must("#campo-mensagem"));
    const notice = /** @type {HTMLElement} */ (must(".c-composer__notice"));
    const send = /** @type {HTMLButtonElement} */ (must(".c-composer__send"));
    const count = /** @type {HTMLElement} */ (must(".c-composer__count"));
    const hint = /** @type {HTMLElement} */ (must(".c-composer__hint"));

    /** Aviso de silêncio (até a próxima mensagem aceita). */
    let mutedText = "";
    let queuedText = "";

    const paintNotice = () => {
        notice.textContent = mutedText || queuedText;
        notice.dataset.kind = mutedText ? "muted" : "queued";
    };

    /** Altura acompanha o texto, até o limite (depois rola por dentro). */
    const resize = () => {
        input.style.height = "auto";
        const conversation =
            footer.parentElement?.getBoundingClientRect().height ?? window.innerHeight;
        const max = Math.max(96, Math.round(conversation * 0.4));
        const height = Math.min(input.scrollHeight, max);
        input.style.height = `${height}px`;
        input.style.overflowY = input.scrollHeight > max ? "auto" : "hidden";
    };

    const paintCount = () => {
        const length = input.value.length;
        const show = length >= COUNT_FROM;
        count.hidden = !show;
        count.textContent = show ? `${length} / ${LIMITS.messageMaxLength}` : "";
        count.dataset.level = length >= LIMITS.messageMaxLength ? "limit" : "near";
        send.setAttribute("aria-disabled", String(input.value.trim() === ""));
    };

    let limitAnnounced = false;
    const afterChange = () => {
        resize();
        paintCount();
        if (input.value.length >= LIMITS.messageMaxLength && !limitAnnounced) {
            limitAnnounced = true;
            onNotice(format(strings.composer.limit, { max: LIMITS.messageMaxLength }));
        } else if (input.value.length < LIMITS.messageMaxLength) {
            limitAnnounced = false;
        }
    };

    const submitNow = () => {
        const content = input.value.trim().slice(0, LIMITS.messageMaxLength);
        if (!content) return;
        input.value = "";
        afterChange();
        onInput("", 0);
        onSend(content);
        // A dica de teclas só ensina: some depois da primeira mensagem.
        hint.hidden = true;
    };

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        submitNow();
    });

    const reportInput = () => onInput(input.value, input.selectionStart ?? input.value.length);

    /**
     * @param {keyof typeof MARKS} kind
     */
    const applyFormat = (kind) => {
        const result = wrapSelection(
            input.value,
            input.selectionStart ?? input.value.length,
            input.selectionEnd ?? input.value.length,
            MARKS[kind],
        );
        if (result.value.length > LIMITS.messageMaxLength) {
            onNotice(format(strings.composer.limit, { max: LIMITS.messageMaxLength }));
            return;
        }
        input.value = result.value;
        input.setSelectionRange(result.start, result.end);
        input.focus();
        afterChange();
        reportInput();
    };

    input.addEventListener("input", () => {
        // Comando não é digitação de mensagem: não avisa "digitando…".
        if (!input.value.startsWith("/")) onTyping();
        afterChange();
        reportInput();
    });
    // O cursor também muda por clique e setas: a sugestão acompanha.
    input.addEventListener("click", reportInput);
    input.addEventListener("keyup", (event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) reportInput();
    });
    input.addEventListener("paste", (event) => {
        const pasted = event.clipboardData?.getData("text") ?? "";
        const selected = (input.selectionEnd ?? 0) - (input.selectionStart ?? 0);
        const total = input.value.length - selected + pasted.length;
        if (total > LIMITS.messageMaxLength) {
            onNotice(
                format(strings.composer.pasteTooLong, { n: total, max: LIMITS.messageMaxLength }),
            );
        }
    });
    input.addEventListener("keydown", (event) => {
        // O autocomplete pode tomar a tecla (setas, Enter, Tab, Escape).
        if (onKeyDown(event)) {
            event.preventDefault();
            return;
        }
        const mod = event.ctrlKey || event.metaKey;
        if (event.key === "Enter" && !event.isComposing) {
            if (mod || (!event.shiftKey && !event.altKey && !touch())) {
                event.preventDefault();
                submitNow();
            }
            return;
        }
        if (mod && !event.shiftKey && !event.altKey) {
            const key = event.key.toLowerCase();
            /** @type {keyof typeof MARKS | null} */
            const kind =
                key === "b" ? "bold" : key === "i" ? "italic" : key === "e" ? "code" : null;
            if (kind) {
                event.preventDefault();
                applyFormat(kind);
            }
        }
    });

    for (const button of form.querySelectorAll("[data-composer-format]")) {
        // mousedown não tira o foco nem a seleção do campo.
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", () =>
            applyFormat(
                /** @type {keyof typeof MARKS} */ (button.getAttribute("data-composer-format")),
            ),
        );
    }
    form.querySelector('[data-composer-tool="commands"]')?.addEventListener("click", () => {
        onCommands();
    });

    // No toque, Enter quebra a linha: o teclado mostra "enter".
    const syncEnterHint = () => input.setAttribute("enterkeyhint", touch() ? "enter" : "send");
    syncEnterHint();
    window.matchMedia("(pointer: coarse)").addEventListener("change", syncEnterHint);
    window.addEventListener("resize", resize);
    afterChange();

    return {
        /**
         * @param {boolean} visible
         */
        setVisible(visible) {
            footer.hidden = !visible;
            if (visible) requestAnimationFrame(resize);
        },

        focus() {
            input.focus();
        },

        /** O texto no campo agora (rascunho da conversa aberta). */
        getValue: () => input.value,

        /**
         * Troca o texto sem mover o foco nem abrir sugestões — usado ao
         * trocar de conversa (cada uma tem o seu rascunho).
         * @param {string} text
         */
        restore(text) {
            input.value = text;
            afterChange();
            onInput("", 0);
        },

        /**
         * Substitui o texto do campo (autocomplete) e põe o cursor no fim.
         * @param {string} text
         */
        setValue(text) {
            input.value = text;
            input.setSelectionRange(text.length, text.length);
            input.focus();
            afterChange();
            reportInput();
        },

        /**
         * Insere texto na posição do cursor (ex.: "/" do botão Comandos).
         * @param {string} text
         */
        insert(text) {
            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? input.value.length;
            input.setRangeText(text, start, end, "end");
            input.focus();
            afterChange();
            reportInput();
        },

        /**
         * Troca um trecho do texto (ex.: "@par" → "@pessoa ") e põe o
         * cursor no fim do trecho novo.
         * @param {number} start
         * @param {number} end
         * @param {string} text
         */
        replaceRange(start, end, text) {
            input.setRangeText(text, start, end, "end");
            input.focus();
            afterChange();
            reportInput();
        },

        /** O campo, para o autocomplete apontar atributos ARIA. */
        input,

        /**
         * Aviso de silêncio da moderação: fica até uma mensagem passar.
         * @param {string} text  vazio tira o aviso
         */
        setMuted(text) {
            mutedText = text;
            paintNotice();
        },

        /**
         * @param {import("../state/store.js").LinkState} link
         * @param {number} queued
         */
        render(link, queued) {
            const blocked = link === "offline";
            form.dataset.state = blocked ? "blocked" : queued > 0 ? "queued" : "ready";
            input.disabled = blocked;
            send.disabled = blocked;
            queuedText = queued > 0 && !blocked ? strings.conn.queued : "";
            paintNotice();
        },
    };
};
