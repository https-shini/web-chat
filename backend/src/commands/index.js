/**
 * Monta o registro com todos os comandos disponíveis.
 * Para acrescentar um comando, inclua sua definição num dos arquivos de
 * `handlers/` (ou num arquivo novo listado aqui). Ver docs/CHAT_COMMANDS.md.
 */

import { createCommandRegistry } from "./registry.js";
import { adminCommands } from "./handlers/admin.js";
import { basicCommands } from "./handlers/basic.js";
import { formattingCommands } from "./handlers/formatting.js";
import { profileCommands } from "./handlers/profile.js";
import { socialCommands } from "./handlers/social.js";

export const createDefaultRegistry = () => {
    const registry = createCommandRegistry();
    for (const command of [
        ...basicCommands,
        ...profileCommands,
        ...socialCommands,
        ...formattingCommands,
        ...adminCommands,
    ]) {
        registry.register(command);
    }
    return registry;
};
