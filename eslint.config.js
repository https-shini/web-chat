import js from "@eslint/js";
import globals from "globals";

export default [
    { ignores: ["dist/**", "node_modules/**", "backend/node_modules/**"] },

    // Frontend: módulos ES rodando no navegador.
    {
        files: ["frontend/src/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: globals.browser,
        },
        rules: {
            ...js.configs.recommended.rules,
            eqeqeq: ["error", "smart"],
            "no-var": "error",
            "prefer-const": "error",
            // A regra da entrega: nada de HTML injetado.
            "no-restricted-properties": [
                "error",
                {
                    property: "innerHTML",
                    message: "Use textContent e createElement.",
                },
                {
                    property: "outerHTML",
                    message: "Use textContent e createElement.",
                },
            ],
            // Exatamente o defeito do script.js antigo: const declarada num
            // case vazando para as cláusulas seguintes. A regra nativa mira
            // a declaração, não a ausência de chaves — `case x: return y` não
            // vaza nada e não é erro.
            "no-case-declarations": "error",
            "no-restricted-syntax": [
                "error",
                {
                    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
                    message: "Use textContent e createElement.",
                },
            ],
        },
    },

    // Backend e scripts: Node.
    {
        files: ["backend/src/**/*.js", "scripts/**/*.mjs", "vite.config.js", "eslint.config.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: globals.node,
        },
        rules: { ...js.configs.recommended.rules },
    },
    {
        files: ["backend/src/**/*.js"],
        languageOptions: { sourceType: "commonjs" },
    },
];
