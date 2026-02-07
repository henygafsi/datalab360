import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Structured error shape returned by backend for SQL/step errors (mapping, workflow, bi_reporting, explore-design).
 */
export interface StructuredErrorDetail {
  detail?: string;
  error_type?: string;
  hint?: string;
  snowflake?: { errno?: number; sqlstate?: string; msg?: string };
  step?: string;
}

/**
 * Normalize FastAPI error detail to a string so it is safe to render (avoids "Objects are not valid as a React child").
 * detail can be: string, array of { type, loc, msg, input }, or object like { error, message } or StructuredErrorDetail.
 */
export function formatApiDetail(detail: unknown): string {
  if (detail == null) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: any) => d.msg ?? d.message ?? JSON.stringify(d)).join("; ");
  }
  if (typeof detail === "object") {
    const o = detail as Record<string, unknown>;
    if (typeof o.detail === "string" && (o.error_type != null || o.step != null || o.hint != null)) {
      const parts = [o.detail];
      if (o.step) parts.unshift(`[${o.step}]`);
      if (o.hint) parts.push(`Hint: ${o.hint}`);
      const sf = o.snowflake as { msg?: string } | undefined;
      if (sf?.msg) parts.push(`Snowflake: ${sf.msg}`);
      return parts.join(" ");
    }
    if (typeof o.message === "string") return o.message;
    if (typeof o.error === "string") return o.error;
    if (Array.isArray(o.invalid_modules)) return `Invalid modules: ${(o.invalid_modules as string[]).join(", ")}`;
    return JSON.stringify(detail);
  }
  return String(detail);
}
