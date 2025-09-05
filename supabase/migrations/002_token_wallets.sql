-- Token usage wallet and transactions
-- Users hold USD credits; AI calls deduct actual cost based on model usage

-- Enable pgcrypto for gen_random_uuid if not already
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Wallet table
CREATE TABLE IF NOT EXISTS user_token_wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  total_spent_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_token_wallets_user_id_idx ON user_token_wallets(user_id);

-- Transactions table
CREATE TABLE IF NOT EXISTS token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('debit','credit')),
  amount_usd NUMERIC(12,6) NOT NULL,
  balance_after NUMERIC(12,6),
  model_name TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  thoughts_tokens INTEGER,
  thread_id UUID,
  message_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS token_transactions_user_id_idx ON token_transactions(user_id);
CREATE INDEX IF NOT EXISTS token_transactions_created_at_idx ON token_transactions(created_at DESC);

-- RLS
ALTER TABLE user_token_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;

-- Policies: users can view only their own wallet and transactions
DO $$ BEGIN
  CREATE POLICY "Users can view their wallet" ON user_token_wallets
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view their token transactions" ON token_transactions
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Prevent direct writes by users; updates are performed via SECURITY DEFINER functions
DO $$ BEGIN
  CREATE POLICY "No direct writes to wallet" ON user_token_wallets
    FOR ALL TO authenticated USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "No direct writes to transactions" ON token_transactions
    FOR ALL TO authenticated USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_user_token_wallets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_token_wallets_updated_at_trigger ON user_token_wallets;
CREATE TRIGGER user_token_wallets_updated_at_trigger
  BEFORE UPDATE ON user_token_wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_user_token_wallets_updated_at();

-- Helper: ensure wallet row exists
CREATE OR REPLACE FUNCTION ensure_user_wallet(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO user_token_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;$$;

-- Debit function with atomic check; returns new balance
CREATE OR REPLACE FUNCTION wallet_debit(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  PERFORM ensure_user_wallet(p_user_id);

  UPDATE user_token_wallets
  SET balance_usd = balance_usd - p_amount,
      total_spent_usd = total_spent_usd + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
    AND balance_usd >= p_amount
  RETURNING balance_usd INTO v_balance;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
  END IF;

  RETURN v_balance;
END;$$;

-- Credit function; returns new balance
CREATE OR REPLACE FUNCTION wallet_credit(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  PERFORM ensure_user_wallet(p_user_id);

  UPDATE user_token_wallets
  SET balance_usd = balance_usd + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance_usd INTO v_balance;

  RETURN v_balance;
END;$$;
