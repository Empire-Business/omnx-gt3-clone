-- Permite posts sem texto (somente com anexos)
ALTER TABLE public.feed_posts
  DROP CONSTRAINT IF EXISTS feed_posts_content_check;

ALTER TABLE public.feed_posts
  ADD CONSTRAINT feed_posts_content_check CHECK (char_length(content) <= 2000);
