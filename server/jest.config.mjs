// Native-ESM Jest for the server workspace. Run with
// NODE_OPTIONS=--experimental-vm-modules (set in package.json scripts).
/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  // Source imports use NodeNext ".js" specifiers; map them back to TS source.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: { parser: { syntax: "typescript" }, target: "es2022" },
        // Keep ES modules so import.meta.url / import.meta.dirname survive.
        module: { type: "es6" },
      },
    ],
  },
  // @langchain/* and other ESM-only deps must be transformed, not ignored.
  // Start permissive; tighten if a CJS dep complains.
  transformIgnorePatterns: ["/node_modules/(?!(@langchain|langsmith|nanoid|uuid)/)"],
  clearMocks: true,
};
