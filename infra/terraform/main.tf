###############################################################################
# Data360 — Live-test infra for the Next.js frontend on SPCS / Native App.
# Provider: snowflakedb/snowflake (>= 1.0). Target: org account uchsfvb-ky11038.
#
# AUTH: do NOT hardcode the PAT. Export before `terraform apply`:
#   export SNOWFLAKE_ORGANIZATION_NAME=...      # org for uchsfvb-ky11038
#   export SNOWFLAKE_ACCOUNT_NAME=KY11038
#   export SNOWFLAKE_USER=ORGAADMIN_USER
#   export SNOWFLAKE_AUTHENTICATOR=PROGRAMMATIC_ACCESS_TOKEN   # [À VÉRIFIER DOC]
#   export SNOWFLAKE_TOKEN=<short-lived PAT>                    # dedicated, rotated after
# NOTE: SPCS object creation needs ACCOUNTADMIN-level privileges; ORGADMIN alone
# is insufficient. Use a role with CREATE COMPUTE POOL / CREATE IMAGE REPOSITORY.
###############################################################################

terraform {
  required_version = ">= 1.5"
  required_providers {
    snowflake = {
      source  = "snowflakedb/snowflake"
      version = "~> 1.0"
    }
  }
}

provider "snowflake" {
  role = var.snowflake_role # e.g. ACCOUNTADMIN
  # NOTE: the resources used here (compute_pool, image_repository,
  # secret_with_generic_string, network_rule, stage, resource_monitor) are
  # documented as stable in the snowflakedb provider — NO preview flag needed.
  # If `terraform apply` errors with "<resource> is in preview", add the exact
  # flag it names to preview_features_enabled here. [verified vs provider docs]
}

# --- Schema namespace for the test app --------------------------------------
resource "snowflake_schema" "app_test" {
  database = var.database # CP_DATA360
  name     = "APP_TEST"
  comment  = "Data360 live-test (SPCS frontend / Native App)"
}

# --- Image repository (Docker images pushed here) ----------------------------
resource "snowflake_image_repository" "repo" {
  database = var.database
  schema   = snowflake_schema.app_test.name
  name     = "DATA360_REPO"
}

# --- Stage holding the SPCS service spec (Track A direct CREATE SERVICE) -----
resource "snowflake_stage" "specs" {
  database = var.database
  schema   = snowflake_schema.app_test.name
  name     = "SPECS"
  comment  = "SPCS service specification files (uploaded by deploy-live.sh)"
}

# --- Compute pool to run the service ----------------------------------------
# COST GUARD for the pool is here: max_nodes=1 + auto_suspend. A resource
# monitor does NOT govern compute-pool credits — only warehouses. Suspend/DROP
# the pool after the test.
resource "snowflake_compute_pool" "pool" {
  name            = "DATA360_POOL"
  min_nodes       = 1
  max_nodes       = 1
  instance_family = "CPU_X64_XS"
  auto_suspend_secs = 600
}

# --- Egress to the external backend (api.datalab360.io) ----------------------
resource "snowflake_network_rule" "backend_egress" {
  database  = var.database
  schema    = snowflake_schema.app_test.name
  name      = "DATA360_BACKEND_EGRESS"
  type      = "HOST_PORT"
  mode      = "EGRESS"
  value_list = ["api.datalab360.io:80", "api.datalab360.io:443"]
}

# NOTE: the snowflakedb provider has NO `snowflake_external_access_integration`
# resource. The EAI (DATA360_BACKEND_EAI) is created via SQL by
# `scripts/deploy-live.sh infra` AFTER terraform apply, referencing the network
# rule above. Kept out of state on purpose for this test. [verified vs provider docs]

# --- NextAuth secret (mapped into the service via spec `secrets:`) -----------
resource "snowflake_secret_with_generic_string" "nextauth_secret" {
  database      = var.database
  schema        = snowflake_schema.app_test.name
  name          = "NEXTAUTH_SECRET_OBJ"
  secret_string = var.nextauth_secret # supply via TF_VAR_nextauth_secret env, not tfvars
}

# --- Warehouse credit guardrail (does NOT cover SPCS compute pools) ----------
# Governs COMPUTE_WH credits used by build/queries only. The compute pool's
# real guard is max_nodes=1 + auto_suspend on the pool above.
resource "snowflake_resource_monitor" "guard" {
  name         = "DATA360_APP_TEST_MONITOR"
  credit_quota = var.credit_quota # e.g. 5
  notify_triggers = [50, 75]
  suspend_trigger = 90
  suspend_immediate_trigger = 100
}
