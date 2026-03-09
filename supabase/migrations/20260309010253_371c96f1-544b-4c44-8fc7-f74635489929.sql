
-- Fix all RESTRICTIVE policies to PERMISSIVE for security_settings
DROP POLICY IF EXISTS "Users can view their own security settings" ON public.security_settings;
DROP POLICY IF EXISTS "Users can insert their own security settings" ON public.security_settings;
DROP POLICY IF EXISTS "Users can update their own security settings" ON public.security_settings;

CREATE POLICY "Users can view their own security settings" ON public.security_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own security settings" ON public.security_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own security settings" ON public.security_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Fix documents
DROP POLICY IF EXISTS "Users can view their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can insert their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can update their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;

CREATE POLICY "Users can view their own documents" ON public.documents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own documents" ON public.documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own documents" ON public.documents FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own documents" ON public.documents FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix drawers
DROP POLICY IF EXISTS "Users can view their own drawers" ON public.drawers;
DROP POLICY IF EXISTS "Users can insert their own drawers" ON public.drawers;
DROP POLICY IF EXISTS "Users can update their own drawers" ON public.drawers;
DROP POLICY IF EXISTS "Users can delete their own drawers" ON public.drawers;

CREATE POLICY "Users can view their own drawers" ON public.drawers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own drawers" ON public.drawers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own drawers" ON public.drawers FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own drawers" ON public.drawers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix payment_requests
DROP POLICY IF EXISTS "Users can view their own payment requests" ON public.payment_requests;
DROP POLICY IF EXISTS "Users can insert their own payment requests" ON public.payment_requests;

CREATE POLICY "Users can view their own payment requests" ON public.payment_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own payment requests" ON public.payment_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Fix user_subscriptions
DROP POLICY IF EXISTS "Users can view their own subscription" ON public.user_subscriptions;
DROP POLICY IF EXISTS "Users can insert their own subscription" ON public.user_subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscription" ON public.user_subscriptions;

CREATE POLICY "Users can view their own subscription" ON public.user_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own subscription" ON public.user_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own subscription" ON public.user_subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
