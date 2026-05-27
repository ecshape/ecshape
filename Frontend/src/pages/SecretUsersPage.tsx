import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Users, Eye, EyeOff, Copy, RefreshCw, Shield, 
  User, UserCheck, UserX, Search, Filter
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config/api';

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: 'ADMIN' | 'TRAINER' | 'CLIENT';
  is_active: boolean;
  created_at: string;
  last_login?: string;
  trainer_id?: number;
  password?: string; // Only for development/testing
}

const SecretUsersPage = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPasswords, setShowPasswords] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [copiedUser, setCopiedUser] = useState<number | null>(null);

  // Redirect if not admin
  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      window.location.href = '/';
    }
  }, [user]);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(`${API_BASE_URL}/users/`, { headers });
      if (response.ok) {
        const usersData = await response.json();
        // Add test passwords for development
        const usersWithPasswords = usersData.map((user: User) => ({
          ...user,
          password: getTestPassword(user.username, user.role)
        }));
        setUsers(usersWithPasswords);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTestPassword = (username: string, role: string): string => {
    // Generate predictable test passwords based on username and role
    const basePassword = username.toLowerCase();
    switch (role) {
      case 'ADMIN':
        return `${basePassword}123`;
      case 'TRAINER':
        return `${basePassword}123`;
      case 'CLIENT':
        return `${basePassword}123`;
      default:
        return `${basePassword}123`;
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchUsers();
    }
  }, [user]);

  const copyToClipboard = async (text: string, userId: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedUser(userId);
      setTimeout(() => setCopiedUser(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'destructive';
      case 'trainer':
        return 'default';
      case 'client':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getStatusIcon = (isActive: boolean) => {
    return isActive ? <UserCheck className="w-4 h-4 text-green-500" /> : <UserX className="w-4 h-4 text-red-500" />;
  };

  if (!user || user.role !== 'ADMIN') {
    return (
      <Layout currentPage="dashboard">
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">This page is only accessible to administrators.</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout currentPage="dashboard">
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
            <span className="text-muted-foreground">Loading users...</span>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout currentPage="dashboard">
      <div className="container mx-auto p-4 sm:p-6 space-y-6 w-full max-w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-lg">
              <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Secret Users Management</h1>
              <p className="text-sm sm:text-base text-muted-foreground">Development & Testing Access</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button 
              variant="outline" 
              onClick={() => setShowPasswords(!showPasswords)}
              className="flex items-center justify-center space-x-2 w-full sm:w-auto min-w-0"
            >
              {showPasswords ? <EyeOff className="w-4 h-4 flex-shrink-0" /> : <Eye className="w-4 h-4 flex-shrink-0" />}
              <span className="truncate">{showPasswords ? 'Hide' : 'Show'} Passwords</span>
            </Button>
            <Button onClick={fetchUsers} className="flex items-center justify-center space-x-2 w-full sm:w-auto min-w-0">
              <RefreshCw className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="search">Search Users</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search by username, name, or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-filter">Filter by Role</Label>
                <select
                  id="role-filter"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
                >
                  <option value="all">All Roles</option>
                  <option value="ADMIN">Admin</option>
                  <option value="TRAINER">Trainer</option>
                  <option value="CLIENT">Client</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Total Users</Label>
                <div className="text-2xl font-bold text-foreground">
                  {filteredUsers.length} / {users.length}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="w-5 h-5" />
              <span>Users & Passwords</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-hidden">
            {/* Mobile View - Compact Cards (NO TABLE, NO SLIDER) */}
            <div className="xl:hidden space-y-2">
              {filteredUsers.map((user) => (
                <Card key={user.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <p className="font-semibold text-sm truncate flex-1 min-w-0">{user.username}</p>
                      <Badge variant={getRoleBadgeVariant(user.role)} className="text-xs shrink-0">
                        {user.role}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => copyToClipboard(`${user.username}:${user.password}`, user.id)}
                        title="Copy username:password"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  {showPasswords && (
                    <div className="mt-2 pt-2 border-t">
                      <code className="text-xs bg-muted px-2 py-1 rounded break-all block">{user.password}</code>
                    </div>
                  )}
                </Card>
              ))}
            </div>

            {/* Desktop View - Full Table (ONLY ON EXTRA LARGE SCREENS) */}
            <div className="hidden xl:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    {showPasswords && <TableHead>Password</TableHead>}
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-mono text-sm">{user.id}</TableCell>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>{user.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(user.is_active)}
                          <span className={user.is_active ? 'text-green-600' : 'text-red-600'}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </TableCell>
                      {showPasswords && (
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <code className="text-sm bg-muted px-2 py-1 rounded">
                              {user.password}
                            </code>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(user.password || '', user.id)}
                              className="h-6 w-6 p-0"
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(`${user.username}:${user.password}`, user.id)}
                            className="h-8 w-8 p-0"
                            title="Copy username:password"
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Quick Access Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg">
                  <User className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Admin Access</p>
                  <p className="text-lg font-bold">admin:admin123</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Trainer Access</p>
                  <p className="text-lg font-bold">trainer:trainer123</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                  <User className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Client Access</p>
                  <p className="text-lg font-bold">client:client123</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Copy Feedback */}
        {copiedUser && (
          <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg">
            Copied to clipboard!
          </div>
        )}
      </div>
    </Layout>
  );
};

export default SecretUsersPage; 