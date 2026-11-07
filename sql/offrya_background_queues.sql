-- OFFRYA / Supabase Queues : files durables, serveur uniquement.
-- Ne pas exposer pgmq ni pgmq_public dans PostgREST / Data API.
-- Aucune migration des missions, abonnements, DCE ou notifications.
CREATE EXTENSION IF NOT EXISTS pgmq;

SELECT pgmq.create('offrya_ai_jobs');
SELECT pgmq.create('offrya_import_jobs');
SELECT pgmq.create('offrya_notification_jobs');

-- Le navigateur et les JWT utilisateurs ne peuvent pas accéder aux files.
-- Les futurs producteurs/consommateurs utiliseront une connexion PostgreSQL
-- privée, depuis un service de confiance, avec rôle minimal.
REVOKE USAGE ON SCHEMA pgmq FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA pgmq FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA pgmq FROM PUBLIC, anon, authenticated;
