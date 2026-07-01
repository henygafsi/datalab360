# Data360 (test build)

The Data360 unified data platform frontend, packaged as a Snowflake Native App
running on Snowpark Container Services (SPCS).

## Install (consumer steps)
1. Grant the requested account privileges (`CREATE COMPUTE POOL`, `BIND SERVICE ENDPOINT`).
2. Bind the **Data360 backend API access** reference to an External Access
   Integration that allows egress to the Data360 backend.
3. Start the service:
   ```sql
   CALL DATA360_APP.core.start_app('DATA360_POOL');
   ```
4. Get the URL:
   ```sql
   CALL DATA360_APP.core.app_url();
   ```

This is a **test build** for live validation inside the organization (private /
organizational listing). Not a public paid listing.
