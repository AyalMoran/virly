// Postgres-backed contract suites. Serial (one shared DB); self-skip without
// CONTRACT_PG_URL / CONTRACT_VECTOR_URL / CONTRACT_MONGO_URL.
/** @type {import('jest').Config} */
export default {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/contract"],
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": [
      "@swc/jest",
      {
        jsc: { parser: { syntax: "typescript" }, target: "es2022" },
        module: { type: "es6" },
      },
    ],
  },
  transformIgnorePatterns: ["/node_modules/(?!(@langchain|langsmith|nanoid|uuid)/)"],
  maxWorkers: 1,
  clearMocks: true,
};
