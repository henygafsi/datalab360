variable "snowflake_role" {
  type        = string
  default     = "ACCOUNTADMIN"
  description = "Account role used to create SPCS objects (ORGADMIN is insufficient)."
}

variable "database" {
  type        = string
  default     = "CP_DATA360"
  description = "Target database."
}

variable "nextauth_secret" {
  type        = string
  sensitive   = true
  description = "NextAuth secret. Pass via TF_VAR_nextauth_secret env, never commit."
}

variable "credit_quota" {
  type        = number
  default     = 5
  description = "Resource monitor credit quota for the test (cost guardrail)."
}
