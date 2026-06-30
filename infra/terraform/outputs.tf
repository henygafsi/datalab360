output "image_repository_url" {
  value       = snowflake_image_repository.repo.repository_url
  description = "Docker registry URL to tag/push the frontend image."
}

output "compute_pool" {
  value       = snowflake_compute_pool.pool.name
  description = "Compute pool that runs the SPCS service."
}

output "backend_network_rule" {
  value       = snowflake_network_rule.backend_egress.fully_qualified_name
  description = "Network rule the EAI (created via SQL in deploy-live.sh) wraps."
}

output "schema" {
  value       = "${var.database}.${snowflake_schema.app_test.name}"
  description = "Fully-qualified app schema."
}
