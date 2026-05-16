import { baseApi } from '@/app/store';

export interface RoleSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  _count: { users: number };
  permissions: { permission: { key: string } }[];
}

export interface PermissionRow {
  id: string;
  key: string;
  module: string;
  action: string;
  description: string;
}

export interface TeamUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  shopId: string | null;
  roleId: string;
  isActive: boolean;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: { slug: string; name: string };
  shop: { name: string } | null;
}

export interface UserDetail extends TeamUser {
  permissionOverrides: { permissionId: string; granted: boolean; permission: { key: string } }[];
}

export const teamApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    listUsers: b.query<{ data: TeamUser[] }, { q?: string; roleId?: string; shopId?: string; isActive?: boolean } | void>({
      query: (q) => ({ url: '/users', params: q ?? {} }),
      providesTags: ['User'],
    }),
    getUser: b.query<{ data: UserDetail }, string>({
      query: (id) => `/users/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'User', id }],
    }),
    createUser: b.mutation<
      { data: { user: TeamUser; initialPassword?: string } },
      { name: string; email: string; phone?: string | null; shopId?: string | null; roleId: string; initialPassword?: string }
    >({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: ['User'],
    }),
    updateUser: b.mutation<{ data: TeamUser }, { id: string; patch: Partial<{ name: string; phone: string | null; shopId: string | null; roleId: string; isActive: boolean }> }>({
      query: ({ id, patch }) => ({ url: `/users/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: (_r, _e, { id }) => ['User', { type: 'User', id }],
    }),
    resetPassword: b.mutation<
      { data: { temporaryPassword?: string } },
      { id: string; newPassword?: string; forceChangeOnNextLogin?: boolean }
    >({
      query: ({ id, ...body }) => ({ url: `/users/${id}/reset-password`, method: 'POST', body }),
    }),
    setUserPermissions: b.mutation<void, { id: string; grants: string[]; denies: string[]; reason?: string | null }>({
      query: ({ id, ...body }) => ({ url: `/users/${id}/permissions`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'User', id }],
    }),

    listRoles: b.query<{ data: RoleSummary[] }, void>({
      query: () => '/roles',
      providesTags: ['Role'],
    }),
    listPermissions: b.query<{ data: PermissionRow[] }, void>({
      query: () => '/roles/permissions',
      providesTags: ['Permission'],
    }),
    createRole: b.mutation<{ data: RoleSummary }, { slug: string; name: string; description?: string | null; permissionKeys: string[] }>({
      query: (body) => ({ url: '/roles', method: 'POST', body }),
      invalidatesTags: ['Role'],
    }),
    updateRole: b.mutation<{ data: RoleSummary }, { id: string; patch: { name?: string; description?: string | null; permissionKeys?: string[] } }>({
      query: ({ id, patch }) => ({ url: `/roles/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: ['Role'],
    }),
    deleteRole: b.mutation<void, string>({
      query: (id) => ({ url: `/roles/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Role'],
    }),
  }),
});

export const {
  useListUsersQuery,
  useGetUserQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useResetPasswordMutation,
  useSetUserPermissionsMutation,
  useListRolesQuery,
  useListPermissionsQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
} = teamApi;
