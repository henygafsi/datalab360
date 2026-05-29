/**
 * Gouvernance Service - User Roles Management
 * Handles user-role assignments and permissions
 */
import apiClient from '@/lib/api-client';

/**
 * Get all roles assigned to a specific user
 * Uses the new endpoint: GET /gouvernance/users/{username}/roles
 * @param username The username to fetch roles for
 * @returns Array of role names assigned to the user
 */
export async function getUserRoles(username: string): Promise<string[]> {
  try {
    const response = await apiClient.get(`/gouvernance/users/${username}/roles`);
    // Backend should return array of role names directly
    if (Array.isArray(response.data)) {
      return response.data as string[];
    }
    // Fallback: if backend returns object with roles property
    if (response.data?.roles && Array.isArray(response.data.roles)) {
      return response.data.roles as string[];
    }
    console.warn('Unexpected response format from getUserRoles:', response.data);
    return [];
  } catch (error: any) {
    // If endpoint doesn't exist yet, fall back to parsing user details
    if (error.response?.status === 404 || error.response?.status === 405) {
      console.warn('GET /users/{username}/roles not available, using fallback');
      const userResponse = await apiClient.get(`/gouvernance/users/${username}`);
      const user = userResponse.data;

      const roles: string[] = [];
      if (user.default_role) {
        roles.push(user.default_role);
      }
      if (user.default_secondary_roles && user.default_secondary_roles !== '[]') {
        try {
          const secondaryRoles = JSON.parse(
            user.default_secondary_roles.replace(/'/g, '"')
          ) as string[];
          if (Array.isArray(secondaryRoles)) {
            roles.push(...secondaryRoles);
          }
        } catch (e) {
          console.warn('Could not parse secondary roles');
        }
      }
      return Array.from(new Set(roles));
    }
    console.error(`Error fetching roles for user ${username}:`, error);
    throw error;
  }
}
/**
 * Assign a role to a user
 * @param username The username to assign the role to
 * @param roleName The role name to assign
 */
export async function assignRoleToUser(
  username: string,
  roleName: string
): Promise<{ message: string }> {
  try {
    const response = await apiClient.post('/gouvernance/assign-role', {
      username,
      role_name: roleName,
    });
    return response.data;
  } catch (error) {
    console.error('Error assigning role to user:', error);
    throw error;
  }
}

/**
 * Unassign a role from a user
 * @param username The username to unassign the role from
 * @param roleName The role name to unassign
 */
export async function unassignRoleFromUser(
  username: string,
  roleName: string
): Promise<{ message: string }> {
  try {
    const response = await apiClient.delete('/gouvernance/unassign-role', {
      data: {
        username,
        role_name: roleName,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error unassigning role from user:', error);
    throw error;
  }
}

/**
 * Update all roles for a specific user (replaces existing roles)
 *
 * Since PUT /gouvernance/users/{username}/roles might not be implemented yet,
 * this function uses the working assign-role and unassign-role endpoints.
 *
 * Strategy:
 * 1. Get current roles
 * 2. Unassign roles that are no longer needed
 * 3. Assign new roles
 *
 * @param username The username to update roles for
 * @param roles Array of role names to assign
 */
export async function updateUserRoles(
  username: string,
  roles: string[]
): Promise<{ message: string; username: string; roles: string[] }> {
  try {
    // First, try the direct endpoint (API v111)
    try {
      const response = await apiClient.put(`/gouvernance/users/${username}/roles`, {
        roles,
      });
      return response.data;
    } catch (directError: any) {
      // If 404 or 405, fall back to manual assign/unassign
      if (directError.response?.status === 404 || directError.response?.status === 405) {
        console.warn('Direct PUT endpoint not available, using assign/unassign fallback');

        // Get current roles from user data
        const userResponse = await apiClient.get(`/gouvernance/users/${username}`);
        const user = userResponse.data;

        const currentRoles: string[] = [];
        if (user.default_role) {
          currentRoles.push(user.default_role);
        }
        if (user.default_secondary_roles && user.default_secondary_roles !== '[]') {
          try {
            const secondaryRoles = JSON.parse(
              user.default_secondary_roles.replace(/'/g, '"')
            ) as string[];
            if (Array.isArray(secondaryRoles)) {
              currentRoles.push(...secondaryRoles);
            }
          } catch (e) {
            console.warn('Could not parse secondary roles');
          }
        }

        // Find roles to unassign and assign
        const rolesToUnassign = currentRoles.filter((r) => !roles.includes(r));
        const rolesToAssign = roles.filter((r) => !currentRoles.includes(r));

        // Unassign old roles
        for (const role of rolesToUnassign) {
          await unassignRoleFromUser(username, role);
        }

        // Assign new roles
        for (const role of rolesToAssign) {
          await assignRoleToUser(username, role);
        }

        return {
          message: `Updated roles for user ${username}`,
          username,
          roles,
        };
      } else {
        throw directError;
      }
    }
  } catch (error) {
    console.error(`Error updating roles for user ${username}:`, error);
    throw error;
  }
}

/**
 * Get all users with their assigned roles and module access
 * This combines user data with their role-based module permissions
 */
export async function getUsersWithRolesAndModules(): Promise<
  Array<{
    username: string;
    displayName: string;
    email: string;
    roles: string[];
    modules: string[];
    status: string;
  }>
> {
  try {
    // Fetch users WITH roles and grants in PARALLEL for better performance
    // Using new endpoint that includes roles: /gouvernance/users-with-roles
    const [usersResponse, grantsResponse] = await Promise.all([
      apiClient.get('/gouvernance/users-with-roles'),  // ← NEW: includes roles!
      apiClient.get('/gouvernance/grants')
    ]);

    const users = usersResponse.data;
    const roleGrants: { role_name: string; modules: string[] }[] = grantsResponse.data;

    console.log('[getUsersWithRolesAndModules] Fetched users with roles:', users.length);

    // Build a map of role -> modules
    const roleToModulesMap = new Map<string, string[]>();
    roleGrants.forEach((grant) => {
      roleToModulesMap.set(grant.role_name, grant.modules || []);
    });

    // Map users to include their modules based on roles
    const usersWithModules = users.map((user: any) => {
      // NEW: Roles are now directly in user.roles array from backend
      const userRoles: string[] = Array.isArray(user.roles) ? user.roles : [];

      console.log(`[getUsersWithRolesAndModules] User ${user.name} has roles:`, userRoles);

      // Get all unique modules from user's roles
      const userModules = new Set<string>();
      userRoles.forEach((role) => {
        const modules = roleToModulesMap.get(role) || [];
        modules.forEach((mod) => userModules.add(mod));
      });

      return {
        username: user.name || user.login_name,
        displayName:
          user.display_name ||
          (user.first_name && user.last_name
            ? `${user.first_name} ${user.last_name}`
            : user.first_name || user.last_name || user.name || user.login_name),
        email: user.email || '',
        roles: Array.from(new Set(userRoles)),
        modules: Array.from(userModules).sort(),
        status: user.disabled === false || user.disabled === 'false' ? 'Active' : 'Disabled',
      };
    });

    return usersWithModules;
  } catch (error) {
    console.error('Error fetching users with roles and modules:', error);
    throw error;
  }
}
