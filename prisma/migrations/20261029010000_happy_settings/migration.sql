BEGIN;
INSERT INTO settings(id,key,value,"updatedAt")
SELECT 'happy-ticket-config','happy_ticket_config',json_build_object('version',version,'config',config::json)::text,"updatedAt" FROM happy_pool WHERE id='main';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM happy_pool p WHERE p.id='main' AND NOT EXISTS(SELECT 1 FROM settings s WHERE s.key='happy_ticket_config' AND (s.value::jsonb->>'version')::integer=p.version AND s.value::jsonb->'config'=p.config::jsonb)) THEN
  RAISE EXCEPTION 'Happy Ticket configuration preservation failed';
 END IF;
END $$;
DROP TABLE happy_pool;
COMMIT;
