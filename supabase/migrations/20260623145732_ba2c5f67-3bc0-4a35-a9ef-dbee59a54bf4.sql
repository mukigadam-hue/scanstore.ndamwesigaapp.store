
-- 1) PIN hashing: rename pin_code -> pin_hash and hash existing values
ALTER TABLE public.security_settings RENAME COLUMN pin_code TO pin_hash;
UPDATE public.security_settings
   SET pin_hash = encode(digest(user_id::text || ':' || pin_hash, 'sha256'), 'hex')
 WHERE pin_hash IS NOT NULL;

-- 2) user_subscriptions: drop UPDATE policy entirely; restrict INSERT to free-tier defaults only
DROP POLICY IF EXISTS "Users can update their own subscription" ON public.user_subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscription" ON public.user_subscriptions;

CREATE POLICY "Users can insert their own free subscription"
ON public.user_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND tier = 'free'
  AND status = 'active'
  AND storage_limit_bytes = 52428800
  AND expires_at IS NULL
  AND retrieval_expires_at IS NULL
);

-- 3) Lock down SECURITY DEFINER function executability (trigger usage is unaffected)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
