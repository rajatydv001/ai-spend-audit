process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test-db";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET || "TEST_SESSION_SECRET_0123456789_0123456789_0123456789";
process.env.NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
process.env.TRUST_PROXY = process.env.TRUST_PROXY || "1";
