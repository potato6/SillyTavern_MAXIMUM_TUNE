// @ts-expect-error TS(2792): Cannot find module 'typescript-eslint'. Did you me... Remove this comment to see the full error message
import tseslint from "typescript-eslint";
// @ts-expect-error TS(2792): Cannot find module 'eslint-plugin-jsdoc'. Did you ... Remove this comment to see the full error message
import jsdoc from "eslint-plugin-jsdoc";
// @ts-expect-error TS(2792): Cannot find module 'eslint-plugin-jest'. Did you m... Remove this comment to see the full error message
import jest from "eslint-plugin-jest";
// @ts-expect-error TS(2792): Cannot find module 'eslint-plugin-playwright'. Did... Remove this comment to see the full error message
import playwright from "eslint-plugin-playwright";
// @ts-expect-error TS(2792): Cannot find module 'globals'. Did you mean to set ... Remove this comment to see the full error message
import globals from "globals";
// @ts-expect-error TS(2792): Cannot find module 'eslint-plugin-prettier'. Did y... Remove this comment to see the full error message
import eslintConfigPrettier from "eslint-plugin-prettier";

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

const getRules = (config) => {
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
            // Removed stylisticRules mapping here
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
                SillyTavern: "readonly",
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
                SillyTavern: "readonly",
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
