
CREATE TABLE public.clothing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Kıyafet',
  category TEXT NOT NULL DEFAULT 'top',
  primary_color TEXT NOT NULL DEFAULT '#888888',
  color_name TEXT NOT NULL DEFAULT 'renk',
  secondary_colors JSONB NOT NULL DEFAULT '[]'::jsonb,
  secondary_color_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  pattern TEXT NOT NULL DEFAULT 'solid',
  seasons JSONB NOT NULL DEFAULT '["spring","summer","fall","winter"]'::jsonb,
  style TEXT NOT NULL DEFAULT 'casual',
  image_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clothing_items TO authenticated;
GRANT ALL ON public.clothing_items TO service_role;

ALTER TABLE public.clothing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own items select" ON public.clothing_items FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own items insert" ON public.clothing_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own items update" ON public.clothing_items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own items delete" ON public.clothing_items FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX clothing_items_user_created_idx ON public.clothing_items(user_id, created_at DESC);

CREATE POLICY "wardrobe owner select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'wardrobe' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "wardrobe owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'wardrobe' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "wardrobe owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'wardrobe' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "wardrobe owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'wardrobe' AND auth.uid()::text = (storage.foldername(name))[1]);
