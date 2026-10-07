-- 0012 · TOTP replay guard
--
-- Rejecting a reused TOTP code needs to know two things: which 30-second window
-- was last used (the counter) and which code inside it was spent. The counter
-- alone is not enough — it would also reject the *next* code in the same
-- window, which means a user who logs in twice inside 30 seconds (very common
-- right after enrolling) gets "invalid code" for a code that is perfectly valid.

ALTER TABLE users ADD COLUMN totp_last_code_hash TEXT;
