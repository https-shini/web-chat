// @ts-check

/**
 * Busca de identidades online. A busca não faz enumeração automática:
 * exige 3 caracteres, aplica debounce e apresenta somente dados públicos
 * validados pelo servidor.
 *
 * @param {{
 *   onSearch: (query: string) => void,
 *   onSelect: (username: string) => void,
 * }} options
 */
export const createUserSearch = ({ onSearch, onSelect }) => {
    const section = document.createElement("section");
    section.className = "c-user-search";
    section.hidden = true;
    section.setAttribute("aria-label", "Buscar usuários");

    const title = document.createElement("h2");
    title.textContent = "Encontrar alguém";
    const label = document.createElement("label");
    label.htmlFor = "home-user-search";
    label.textContent = "Pesquisar por @username";
    const input = document.createElement("input");
    input.id = "home-user-search";
    input.type = "search";
    input.autocomplete = "off";
    input.placeholder = "Digite pelo menos 3 caracteres";
    input.maxLength = 21;
    const status = document.createElement("p");
    status.className = "c-user-search__status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const list = document.createElement("ul");
    list.className = "c-user-search__results";
    section.append(title, label, input, status, list);

    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;
    let current = "";
    const clearTimer = () => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
    };

    input.addEventListener("input", () => {
        clearTimer();
        list.replaceChildren();
        current = input.value.trim().replace(/^@/, "").toLowerCase();
        if (current.length < 3) {
            status.textContent = "Digite pelo menos 3 caracteres para pesquisar.";
            return;
        }
        if (!/^[a-z0-9_.]{3,20}$/.test(current)) {
            status.textContent = "Use letras, números, ponto ou _.";
            return;
        }
        status.textContent = "Pesquisando…";
        timer = setTimeout(() => onSearch(current), 400);
    });

    list.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest("button[data-username]");
        if (!(button instanceof HTMLButtonElement)) return;
        const username = button.dataset.username;
        if (username) onSelect(username);
    });

    return {
        element: section,
        open() {
            section.hidden = false;
            input.focus();
            status.textContent = "Digite pelo menos 3 caracteres para pesquisar.";
        },
        close() {
            clearTimer();
            section.hidden = true;
        },
        /** @param {string} query @param {{id: string, username: string, name: string}[]} users */
        setResults(query, users) {
            if (query !== current || section.hidden) return;
            clearTimer();
            list.replaceChildren();
            status.textContent = users.length
                ? users.length + " usuário(s) encontrado(s)."
                : "Nenhum usuário online encontrado.";
            for (const user of users) {
                const item = document.createElement("li");
                const button = document.createElement("button");
                button.type = "button";
                button.dataset.username = user.username;
                button.textContent = user.name + " (@" + user.username + ")";
                item.append(button);
                list.append(item);
            }
        },
        /** @param {string} message */
        setError(message) {
            clearTimer();
            status.textContent = message;
        },
    };
};
