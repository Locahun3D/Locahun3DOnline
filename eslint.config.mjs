import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build artifacts — must not be linted.
    ".open-next/**",
    ".wrangler/**",
    // ベンダーしたサードパーティ配布物。自分で書いたコードではないので
    // lint 対象にしない（Spark 本体を毎回30件近い指摘で汚さない）。
    // 更新手順は public/viewer/vendor/README.md。
    "public/viewer/vendor/**",
  ]),
  {
    rules: {
      // `_` 始まりは「意図的に使わない」印として使っているので未使用扱いしない
      // （分割代入で捨てる値・将来用に残す引数など）。
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
