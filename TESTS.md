# Testing Guide

## Overview
This project uses Vitest for unit and route-integration testing, plus Playwright for browser E2E smoke flows. Tests cover the audit engine, entitlements/plan gating, rate limiting, subscriptions, auth/sessions, authorization guards, and the API route layer.

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
- Entitlement/plan-gating tests (rolling 30-day audit + export windows, confirmed plan status)
- Rate-limiting tests (memory + Upstash backends, trust-proxy/IP extraction)
- Subscription tests (checkout sessions, billing portal, webhook events, billing info)
- Auth + session tests (login/logout, DPRG, authorization guard hierarchy)
- Route-integration tests with mocked services/prisma (audits, export, members, invites, notifications, AI insights, admin stats, pricing catalog, errors pipeline)

## File locations
- `tests/` contains unit tests, route-integration tests, and mocks.
- `vitest.config.ts` configures Vitest for the project.
- Browser E2E smoke flows (`qa.spec.mjs`, Playwright) are maintained in the QA harness outside the repo and run against a live dev server + local Postgres.

## CI integration
The GitHub Actions workflow `/.github/workflows/ci.yml` runs `npm test`, `npm run lint`, and `npm run build` in the repository root on every push to main and pull request. This ensures all code changes are validated before merge.
