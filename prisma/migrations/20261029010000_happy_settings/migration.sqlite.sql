-- Preserve configuration before retiring the configuration-only table.
BEGIN TRANSACTION;
INSERT INTO settings(id,key,value,updatedAt)
SELECT 'happy-ticket-config', 'happy_ticket_config', json_object('version',version,'config',json(config)), updatedAt FROM happy_pool WHERE id='main';
CREATE TEMP TABLE happy_config_check (ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO happy_config_check SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM happy_pool WHERE id='main') OR EXISTS(SELECT 1 FROM happy_pool p JOIN settings s ON s.key='happy_ticket_config' WHERE p.id='main' AND json_extract(s.value,'$.version')=p.version AND json(json_extract(s.value,'$.config'))=json(p.config)) THEN 1 ELSE 0 END;
DROP TABLE happy_config_check;
DROP TABLE happy_pool;
COMMIT;
