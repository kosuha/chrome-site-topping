-- Backfill wallets for existing users
-- Creates a user_token_wallets row for every auth.users.id that doesn't have one

INSERT INTO user_token_wallets (user_id)
SELECT u.id
FROM auth.users u
LEFT JOIN user_token_wallets w ON w.user_id = u.id
WHERE w.user_id IS NULL;

-- Optionally, you can seed an initial credit by uncommenting below and setting an amount
-- DO $$
-- DECLARE r RECORD;
-- BEGIN
--   FOR r IN SELECT id FROM auth.users LOOP
--     BEGIN
--       PERFORM wallet_credit(r.id, 0.00); -- set initial amount if needed
--     EXCEPTION WHEN OTHERS THEN
--       -- ignore
--     END;
--   END LOOP;
-- END $$;
