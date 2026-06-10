/**
 * Projects — Comments service (Data360 goal G11).
 *
 * Thin client for the per-project comment thread backed by the new
 * PROJECT_COMMENTS table (see backend app/modules/projects). All three routes
 * live under the unified `/projects` prefix and are membership-gated server-side:
 *
 *   GET    /projects/{id}/comments?limit=   → { project_id, comments[], count }
 *   POST   /projects/{id}/comments          → { comment_id, ... } (parses @mentions)
 *   DELETE /projects/{id}/comments/{cid}    → { comment_id, deleted: true }
 *
 * The list is flat + chronological; each row carries `parent_comment_id` so the
 * UI nests replies client-side. Every fetcher degrades to an empty/neutral
 * value on failure so one 403/404 never blanks the collaboration panel.
 */
// ////dependency//// services.projects → lib.api-client
import apiClient from '@/lib/api-client';

const PREFIX = '/projects';

export interface ProjectComment {
  comment_id: string;
  project_id: string;
  author: string;
  body: string;
  parent_comment_id: string | null;
  mentions: string[];
  created_at: string | null;
  updated_at: string | null;
}

interface CommentsResponse {
  project_id: string;
  comments: ProjectComment[];
  count: number;
}

/** Fetch a project's comment thread (soft-deleted rows already excluded server-side). */
export async function listComments(
  projectId: string,
  limit = 200,
): Promise<ProjectComment[]> {
  try {
    const { data } = await apiClient.get<CommentsResponse>(
      `${PREFIX}/${projectId}/comments`,
      { params: { limit } },
    );
    return Array.isArray(data?.comments) ? data.comments : [];
  } catch {
    return [];
  }
}

/** Post a comment (or a reply when parentCommentId is set). Throws on failure
 * so the caller can surface a posting error. */
export async function addComment(
  projectId: string,
  body: string,
  parentCommentId?: string | null,
): Promise<ProjectComment> {
  const { data } = await apiClient.post<ProjectComment>(
    `${PREFIX}/${projectId}/comments`,
    { body, parent_comment_id: parentCommentId ?? null },
  );
  return data;
}

/** Soft-delete a comment (author or project owner only — enforced server-side). */
export async function deleteComment(
  projectId: string,
  commentId: string,
): Promise<void> {
  await apiClient.delete(`${PREFIX}/${projectId}/comments/${commentId}`);
}
