-- Setup script — runs at INSTALL and at every UPGRADE of the Data360 app.
-- [À VÉRIFIER DOC] allowed statements per manifest_version; service-from-spec
-- in setup scripts; reference-callback signatures.

-- 1) Application roles -------------------------------------------------------
CREATE APPLICATION ROLE IF NOT EXISTS app_admin;
CREATE APPLICATION ROLE IF NOT EXISTS app_user;

-- 2) Versioned schema for app objects ----------------------------------------
CREATE SCHEMA IF NOT EXISTS core;
GRANT USAGE ON SCHEMA core TO APPLICATION ROLE app_admin;
GRANT USAGE ON SCHEMA core TO APPLICATION ROLE app_user;

-- 3) Reference registration callback (consumer binds the backend EAI) --------
CREATE OR REPLACE PROCEDURE core.register_reference(ref_name STRING, operation STRING, ref_or_alias STRING)
  RETURNS STRING
  LANGUAGE SQL
AS
$$
  BEGIN
    CASE (operation)
      WHEN 'ADD' THEN
        SELECT SYSTEM$SET_REFERENCE(:ref_name, :ref_or_alias);
      WHEN 'REMOVE' THEN
        SELECT SYSTEM$REMOVE_REFERENCE(:ref_name);
      WHEN 'CLEAR' THEN
        SELECT SYSTEM$REMOVE_REFERENCE(:ref_name);
    END CASE;
    RETURN 'ok';
  END;
$$;
GRANT USAGE ON PROCEDURE core.register_reference(STRING, STRING, STRING) TO APPLICATION ROLE app_admin;

-- 4) Service lifecycle: consumer-driven start after granting privileges -------
--    The consumer (app_admin) calls start_app() once it has granted
--    CREATE COMPUTE POOL / BIND SERVICE ENDPOINT and bound the backend_eai ref.
CREATE OR REPLACE PROCEDURE core.start_app(pool_name STRING)
  RETURNS STRING
  LANGUAGE SQL
AS
$$
  BEGIN
    -- Create a compute pool (privilege requested in manifest)
    EXECUTE IMMEDIATE
      'CREATE COMPUTE POOL IF NOT EXISTS ' || :pool_name ||
      ' MIN_NODES = 1 MAX_NODES = 1 INSTANCE_FAMILY = CPU_X64_XS';

    -- Create the frontend service from the bundled spec, wiring the bound EAI
    EXECUTE IMMEDIATE
      'CREATE SERVICE IF NOT EXISTS core.data360_frontend' ||
      ' IN COMPUTE POOL ' || :pool_name ||
      ' FROM SPECIFICATION_FILE = ''/specs/data360-frontend.yaml''' ||
      ' EXTERNAL_ACCESS_INTEGRATIONS = (REFERENCE(''backend_eai''))';

    GRANT SERVICE ROLE core.data360_frontend!ALL_ENDPOINTS_USAGE TO APPLICATION ROLE app_user;
    RETURN 'service starting';
  END;
$$;
GRANT USAGE ON PROCEDURE core.start_app(STRING) TO APPLICATION ROLE app_admin;

-- 5) Endpoint accessor -------------------------------------------------------
CREATE OR REPLACE PROCEDURE core.app_url()
  RETURNS STRING
  LANGUAGE SQL
AS
$$
  BEGIN
    RETURN (SELECT ingress_url FROM TABLE(core.data360_frontend!SHOW_ENDPOINTS()) LIMIT 1);
  END;
$$;
GRANT USAGE ON PROCEDURE core.app_url() TO APPLICATION ROLE app_admin;
GRANT USAGE ON PROCEDURE core.app_url() TO APPLICATION ROLE app_user;
