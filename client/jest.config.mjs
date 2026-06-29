// Native-ESM Jest for the client. testEnvironment "node" keeps the existing
// renderToStaticMarkup approach (no jsdom). import.meta.env?.* degrades to
// undefined here, which the source already handles via optional chaining.
/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.tsx", "**/__tests__/**/*.test.ts"],
  // node env has no Web Storage; install in-memory localStorage/sessionStorage
  // shims per test file so client tests are order-independent (see jest.setup.ts).
  setupFiles: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  transform: {
    "^.+\\.tsx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", tsx: true },
          transform: { react: { runtime: "automatic" } },
          target: "es2020",
        },
        module: { type: "es6" },
      },
    ],
  },
  transformIgnorePatterns: ["/node_modules/(?!(framer-motion|motion|lucide-react)/)"],
  clearMocks: true,
};
