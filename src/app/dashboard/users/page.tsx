"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Edit, User, ShieldAlert, ShieldCheck, Ban, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UserProfile {
    id: string;
    name: string | null;
    email: string;
    role: "SUPERADMIN" | "USER";
    status: "ACTIVE" | "SUSPENDED";
    createdAt: string;
    _count?: {
        sessions: number;
    }
}

export default function UsersPage() {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
    const [statusUser, setStatusUser] = useState<UserProfile | null>(null);
    const [statusChanging, setStatusChanging] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        role: "USER"
    });

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await fetch("/api/users");
            if (res.ok) {
                const responseData = await res.json();
                setUsers(responseData?.data || []);
            } else if (res.status === 403) {
                toast.error("Unauthorized. Only Super Admin can view users.");
            }
        } catch (error) {
            console.error("Failed to fetch users", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;

        try {
            const res = await fetch(`/api/users/${editingUser.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            });

            if (res.ok) {
                toast.success("User updated");
                setEditingUser(null);
                setFormData({ name: "", email: "", password: "", role: "USER" });
                fetchUsers();
            } else {
                const error = await res.json();
                toast.error(getApiErrorMessage(error, "Operation failed"));
            }
        } catch {
            toast.error("Operation failed");
        }
    };

    const [deleteId, setDeleteId] = useState<string | null>(null);

    const handleDelete = async (id: string) => {
        setDeleteId(id);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;

        try {
            const res = await fetch(`/api/users/${deleteId}`, { method: "DELETE" });
            if (res.ok) {
                toast.success("User deleted");
                fetchUsers();
            } else {
                const error = await res.json();
                toast.error(getApiErrorMessage(error, "Failed to delete"));
            }
        } catch {
            toast.error("Failed to delete user");
        } finally {
            setDeleteId(null);
        }
    };

    const confirmStatusChange = async () => {
        if (!statusUser || statusChanging) return;

        const nextStatus = statusUser.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
        setStatusChanging(true);

        try {
            const res = await fetch(`/api/users/${statusUser.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: nextStatus }),
            });

            if (res.ok) {
                toast.success(nextStatus === "SUSPENDED" ? "User suspended" : "User reactivated");
                await fetchUsers();
            } else {
                const error = await res.json();
                toast.error(getApiErrorMessage(error, "Failed to update account status"));
            }
        } catch {
            toast.error("Failed to update account status");
        } finally {
            setStatusChanging(false);
            setStatusUser(null);
        }
    };

    const getRoleIcon = (role: string) => {
        switch (role) {
            case "SUPERADMIN": return <ShieldAlert className="h-4 w-4 text-red-500" />;
            case "USER": return <ShieldCheck className="h-4 w-4 text-[var(--pp-ink)]" />;
            default: return <User className="h-4 w-4 text-gray-500" />;
        }
    };

    if (loading) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

    // TODO: Improve RBAC check here if strictly needed, but API protects it.
    // If empty list and not loading, likely unauthorized or empty.

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                        <UsersIcon className="h-5 w-5 sm:h-6 sm:w-6" /> User Management
                    </h1>
                    <p className="text-sm text-muted-foreground">Manage users and roles</p>
                </div>
            </div>

            {/* Existing users can be maintained here; onboarding is self-registration only. */}
            {editingUser && (
                <Card className="border-2 border-primary/20">
                    <CardHeader>
                        <CardTitle>Edit User</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                <div className="space-y-2">
                                    <Label>Name</Label>
                                    <Input
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Email</Label>
                                    <Input
                                        type="email"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                <div className="space-y-2">
                                    <Label>New Password (leave blank to keep)</Label>
                                    <Input
                                        type="password"
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Role</Label>
                                    <Select
                                        value={formData.role}
                                        onValueChange={(v: string) => setFormData({ ...formData, role: v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="SUPERADMIN">Super Admin</SelectItem>
                                            <SelectItem value="USER">User</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="ghost" onClick={() => setEditingUser(null)}>Cancel</Button>
                                <Button type="submit">Update</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* Users Table */}
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {users.map(user => (
                    <Card key={user.id} className="overflow-hidden">
                        <CardContent className="p-0">
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500">
                                            {user.name?.charAt(0) || user.email.charAt(0)}
                                        </div>
                                        <div>
                                            <h3 className="font-semibold">{user.name || "User"}</h3>
                                            <p className="text-xs text-muted-foreground">{user.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">
                                        <Badge variant="outline" className="flex items-center gap-1">
                                            {getRoleIcon(user.role)}
                                            {user.role}
                                        </Badge>
                                        <Badge
                                            variant="outline"
                                            className={user.status === "ACTIVE"
                                                ? "border-[var(--pp-line)] bg-[var(--pp-mint)] text-[var(--pp-ink)]"
                                                : "border-amber-200 bg-amber-50 text-amber-700"}
                                        >
                                            {user.status}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center text-sm text-muted-foreground">
                                    <span>{user._count?.sessions || 0} Sessions</span>
                                    <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-3 flex flex-wrap justify-end gap-2 border-t">
                                {user.role === "USER" && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className={user.status === "ACTIVE"
                                            ? "text-amber-700 hover:text-amber-800"
                                            : "text-[var(--pp-ink)] hover:text-[var(--pp-ink)]"}
                                        onClick={() => setStatusUser(user)}
                                    >
                                        {user.status === "ACTIVE" ? (
                                            <><Ban className="h-4 w-4 mr-1" /> Suspend</>
                                        ) : (
                                            <><RotateCcw className="h-4 w-4 mr-1" /> Reactivate</>
                                        )}
                                    </Button>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => {
                                    setEditingUser(user);
                                    setFormData({
                                        name: user.name || "",
                                        email: user.email,
                                        password: "",
                                        role: user.role
                                    });
                                }}>
                                    <Edit className="h-4 w-4 mr-1" /> Edit
                                </Button>
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(user.id)}>
                                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
            {/* Suspend / Reactivate Confirmation */}
            <AlertDialog open={!!statusUser} onOpenChange={(open) => !open && !statusChanging && setStatusUser(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {statusUser?.status === "ACTIVE" ? "Suspend this user?" : "Reactivate this user?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {statusUser?.status === "ACTIVE"
                                ? "The user's current dashboard session will be invalidated and their WhatsApp sessions will be stopped. Their account data and subscription will be preserved."
                                : "The user will be allowed to sign in again. Their existing account data and subscription remain unchanged."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={statusChanging}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={statusChanging}
                            onClick={confirmStatusChange}
                            className={statusUser?.status === "ACTIVE"
                                ? "bg-amber-600 hover:bg-amber-700"
                                : "bg-[var(--pp-ink)] hover:bg-[var(--pp-ink)]"}
                        >
                            {statusChanging
                                ? "Updating..."
                                : statusUser?.status === "ACTIVE" ? "Suspend User" : "Reactivate User"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the user request and remove their data from our servers.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Continue</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function getApiErrorMessage(payload: unknown, fallback: string): string {
    if (!payload || typeof payload !== "object") return fallback;
    const body = payload as { error?: unknown; message?: unknown };
    if (typeof body.error === "string") return body.error;
    if (typeof body.message === "string") return body.message;
    return fallback;
}

function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    )
}
