import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";
import jest from "eslint-plugin-jest";
import playwright from "eslint-plugin-playwright";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";

const logicalRules = {
    "no-cond-assign": "error",
    "no-unneeded-ternary": "error",
    "no-irregular-whitespace": [
        "error",
        { skipStrings: true, skipTemplates: true },
    ],
    "dot-notation": ["error", { allowPattern: "[A-Z]\\w*$" }],
    "no-async-promise-executor": "off",
    "no-inner-declarations": "off",
    "no-unused-expressions": [
        "error",
        { allowShortCircuit: true, allowTernary: true },
    ],
    "no-control-regex": "off",
    "no-constant-condition": ["error", { checkLoops: false }],
    "require-yield": "off",
};

const getRules = (config: unknown) => {
    if (!config) return {};
    if (Array.isArray(config)) {
        return config.reduce((acc, c) => ({ ...acc, ...(c?.rules || {}) }), {});
    }
    return config?.rules || {};
};

const jsdocRecommendedRules = getRules(jsdoc.configs?.["flat/recommended"]);
const tseslintRecommendedRules = getRules(tseslint.configs.recommended);
const jestRecommendedRules = getRules(jest.configs?.["flat/recommended"]);
const playwrightRecommendedRules = getRules(
    playwright.configs?.["flat/recommended"],
);

export default [
    {
        ignores: [
            "**/node_modules/**",
            "**/dist/**",
            "**/.git/**",
            "public/lib/**",
            "backups/**",
            "data/**",
            "cache/**",
            "src/tokenizers/**",
            "docker/**",
            "plugins/**",
            "**/*.min.js",
            "public/scripts/extensions/**",
            "public/dist/**",
            "**/*.d.ts",
            "**/node_modules/**",
            "public/scripts/extensions/quick-reply/lib/**",
            "public/scripts/extensions/tts/lib/**",
        ],
    },

    {
        plugins: {
            "@typescript-eslint": tseslint.plugin,
            jsdoc,
            jest,
            playwright,
        },
    },

    {
        rules: {
            ...tseslintRecommendedRules,
            ...jsdocRecommendedRules,
        },
    },

    {
        files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts", "**/*.mjs"],
        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: "latest",
            globals: { ...globals.es2015 },
        },
        rules: {
            ...tseslintRecommendedRules,
            "jsdoc/no-undefined-types": [
                "warn",
                { disableReporting: true, markVariablesAsUsed: true },
            ],
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
            "no-undef": "off",
            ...logicalRules,
       },
    },

    {
        files: ["src/**/*.{mjs,ts}", "./*.ts", "plugins/**/*.ts"],
        languageOptions: {
            sourceType: "module",
            globals: {
                ...globals.node,
                globalThis: "readonly",
                Deno: "readonly",
            },
        },
    },

    {
        files: ["public/**/*.ts"],
        languageOptions: {
            sourceType: "module",
            globals: {
                ...globals.browser,
                jquery: true,
                globalThis: "readonly",
                ePub: "readonly",
                pdfjsLib: "readonly",
                toastr: "readonly",
           },
        },
    },

    {
        files: ["tests/**/*.ts"],
        languageOptions: {
            sourceType: "module",
            globals: {
                ...globals.node,
                ...globals.jest,
            },
        },
        rules: {
            ...jestRecommendedRules,
            ...playwrightRecommendedRules,
        },
    },

    // MUST BE LAST: Disables ESLint formatting rules that conflict with Prettier
    eslintConfigPrettier,
];
