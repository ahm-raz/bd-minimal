-- =====================================================================
-- M10: Social media module, part 1 (docs/09-social-media.md)
-- Enum values only. Postgres can't use a new enum value in the same transaction that adds it,
-- so everything that uses these values lives in 20260925000100_social_module.sql.
-- =====================================================================

alter type public.user_role add value if not exists 'social';
alter type public.task_metric add value if not exists 'posts_published';
alter type public.target_metric add value if not exists 'posts_published';
