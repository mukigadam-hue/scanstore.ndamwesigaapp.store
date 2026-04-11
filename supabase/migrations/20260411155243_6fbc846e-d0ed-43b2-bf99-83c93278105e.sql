
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can update own docs storage'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Users can update own docs storage"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'documents'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;
