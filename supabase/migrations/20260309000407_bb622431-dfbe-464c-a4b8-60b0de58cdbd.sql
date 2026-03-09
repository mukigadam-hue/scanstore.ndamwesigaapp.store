
-- Add RLS policies for security_images storage bucket
DO $$
BEGIN
  -- INSERT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can upload their own security images' 
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Users can upload their own security images"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'security_images'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;

  -- SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can view their own security images' 
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Users can view their own security images"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'security_images'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;

  -- UPDATE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can update their own security images' 
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Users can update their own security images"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'security_images'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;

  -- DELETE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can delete their own security images' 
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Users can delete their own security images"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'security_images'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

-- Add trigger for security_settings updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_security_settings_updated_at'
  ) THEN
    CREATE TRIGGER update_security_settings_updated_at
    BEFORE UPDATE ON public.security_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
