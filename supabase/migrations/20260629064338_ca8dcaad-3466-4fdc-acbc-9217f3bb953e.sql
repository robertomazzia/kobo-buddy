
CREATE POLICY "Users read own ebook files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ebooks' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own ebook files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ebooks' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own ebook files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'ebooks' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'ebooks' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own ebook files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ebooks' AND auth.uid()::text = (storage.foldername(name))[1]);
