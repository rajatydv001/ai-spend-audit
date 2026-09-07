-- Backfill: existing invite tokens were stored in plaintext. Hash them with
-- SHA-256 so that a leaked database cannot reveal working invite links.
-- Tokens that are already 64 lowercase-hex chars (already hashed by the new
-- code path) are left untouched.
UPDATE "Invite"
SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex')
WHERE "token" !~ '^[0-9a-f]{64}$';
