export default {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/setup-env.js"],
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: ["src/**/*.js", "!src/server.js"],
};
