-- TASK-02: Distributed Idempotency Keys table for multi-instance Vercel workloads
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  actor_id TEXT NOT NULL,
  operation TEXT NOT NULL DEFAULT 'default',
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, actor_id, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON public.idempotency_keys (created_at);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'idempotency_keys' AND policyname = 'idempotency_keys_actor_isolation'
  ) THEN
    CREATE POLICY idempotency_keys_actor_isolation ON public.idempotency_keys
      FOR ALL
      TO authenticated
      USING (actor_id = auth.uid()::text)
      WITH CHECK (actor_id = auth.uid()::text);
  END IF;
END $$;
