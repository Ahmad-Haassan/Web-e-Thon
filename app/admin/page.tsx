"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserCheck, UserPlus, UserX } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Input,
  Label,
  Select,
  Skeleton,
  Spinner,
} from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import type { UserRole } from "@/lib/client/api-types";
import { createUserSchema } from "@/lib/shared/schemas";

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("EXAMINER");
  const [invite, setInvite] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users", roleFilter, search],
    queryFn: () =>
      api.admin.listUsers({
        role: roleFilter || undefined,
        search: search.trim() || undefined,
      }),
  });

  const createMutation = useMutation({
    mutationFn: api.admin.createUser,
    onSuccess: (res) => {
      toast.success(`User ${res.user.email} created as ${res.user.role}`);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setName("");
      setEmail("");
      setPassword("");
      setShowCreate(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { role?: UserRole; active?: boolean } }) =>
      api.admin.updateUser(id, body),
    onSuccess: () => {
      toast.success("User updated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.admin.deleteUser(id),
    onSuccess: () => {
      toast.success("User deactivated");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: name.trim(),
      email: email.trim(),
      password: invite ? undefined : password || undefined,
      role,
      invite,
    };
    const parsed = createUserSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid user details");
      return;
    }
    createMutation.mutate(parsed.data);
  }

  const users = data?.users ?? [];

  return (
    <AppShell
      allowedRoles={["ADMIN"]}
      title="User & Role Administration"
      subtitle="Provision Examiner and Admin accounts, manage roles, and deactivate access."
      actions={
        <Button onClick={() => setShowCreate((v) => !v)}>
          <UserPlus className="h-4 w-4" />
          {showCreate ? "Close Form" : "Add / Invite User"}
        </Button>
      }
    >
      {showCreate && (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-base font-semibold">Create or Invite Institutional Account</h2>
            <p className="text-xs text-ink-muted">
              Roles are persisted in the server database and enforced by backend RBAC guards.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="new-name">Full Name</Label>
                <Input
                  id="new-name"
                  required
                  placeholder="Dr. Salman Tariq"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="new-email">Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  required
                  placeholder="salman@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="new-role">Role</Label>
                <Select
                  id="new-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                >
                  <option value="EXAMINER">EXAMINER</option>
                  <option value="CANDIDATE">CANDIDATE</option>
                  <option value="ADMIN">ADMIN</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="new-pass">Password {invite ? "(Optional for invite)" : ""}</Label>
                <Input
                  id="new-pass"
                  type="password"
                  disabled={invite}
                  minLength={8}
                  placeholder={invite ? "Email invite sent" : "Min 8 characters"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={invite}
                    onChange={(e) => setInvite(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-accent"
                  />
                  Send Supabase invite email instead of setting password now
                </label>

                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? <Spinner /> : "Create User"}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-subtle" />
              <Input
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2">
              <Select
                aria-label="Filter by role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-44"
              >
                <option value="">All roles</option>
                <option value="ADMIN">Admins</option>
                <option value="EXAMINER">Examiners</option>
                <option value="CANDIDATE">Candidates</option>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-5 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-danger">
              {(error as Error).message}
            </div>
          ) : users.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No users found"
                description="Adjust your search filter or add a new institutional account above."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-surface-subtle text-xs font-medium text-ink-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">User</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-surface-subtle/70">
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-foreground">{u.name}</p>
                        <p className="text-xs text-ink-subtle">{u.email}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <Select
                          aria-label={`Change role for ${u.email}`}
                          value={u.role}
                          onChange={(e) =>
                            updateMutation.mutate({
                              id: u.id,
                              body: { role: e.target.value as UserRole },
                            })
                          }
                          className="h-8 w-36 text-xs"
                        >
                          <option value="ADMIN">ADMIN</option>
                          <option value="EXAMINER">EXAMINER</option>
                          <option value="CANDIDATE">CANDIDATE</option>
                        </Select>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={u.active ? "verified" : "danger"}>
                          {u.active ? "Active" : "Deactivated"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {u.active ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-danger"
                            onClick={() => deactivateMutation.mutate(u.id)}
                          >
                            <UserX className="h-3.5 w-3.5" /> Deactivate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              updateMutation.mutate({
                                id: u.id,
                                body: { active: true },
                              })
                            }
                          >
                            <UserCheck className="h-3.5 w-3.5" /> Reactivate
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
