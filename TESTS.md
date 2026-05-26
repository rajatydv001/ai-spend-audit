# Testing Guide

## Overview
This project uses Vitest for unit and integration testing. Tests are focused on the audit engine, validation logic, and core service utilities.

## How to run tests
Install dependencies:
```bash
npm install
```

Run the test suite:
```bash
npm test
```

Run tests in watch mode during development:
```bash
npm run test:watch
```

## Test coverage
The test suite includes:
- Audit engine unit tests for spend optimization logic
- Validation tests for environment parsing and API request contracts
- Basic integration tests for reusable business logic

## File locations
- `tests/` contains unit tests and integration tests.
- `vitest.config.ts` configures Vitest for the project.

## CI integration
The GitHub Actions workflow `/.github/workflows/ci.yml` runs `npm test` in the repository root. This ensures all code changes are validated before merge.
