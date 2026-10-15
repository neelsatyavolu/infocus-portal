// ESLint flat config (Next.js 16 removed `next lint`). Same presets as the old .eslintrc.json.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", ".open-next/**", "node_modules/**", "next-env.d.ts"] },
  ...nextCoreWebVitals,
  ...nextTypescript
];

export default config;
