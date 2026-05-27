import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2, Eye, Shield, User, Loader2, UserPlus, EyeOff } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

const UsersPage = () => {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const { t } = useTranslation();
  
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: '', email: '', role: '' });
  const [actionLoading, setActionLoading] = useState(false);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState({ username: '', email: '', password: '', confirmPassword: '', full_name: '', role: 'TRAINER' });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  
  const roleOptions = [
    { value: 'ADMIN', label: t('roles.ADMIN') },
    { value: 'TRAINER', label: t('roles.TRAINER') },
    { value: 'CLIENT', label: t('roles.CLIENT') },
  ];

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    fetchUsers();
  }, [user]);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/users/`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      setError(t('admin.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId) => {
    // Prevent admin from deleting themselves
    if (user?.id === userId) {
      addNotification({
        type: 'error',
        title: t('admin.cannotDeleteSelf'),
        message: t('admin.cannotDeleteSelfMessage', 'You cannot delete your own account')
      });
      return;
    }
    
    if (!window.confirm(t('admin.deleteConfirm'))) return;
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: 'Failed to delete user' }));
        throw new Error(errorData.detail || 'Failed to delete user');
      }
      
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      addNotification({
        type: 'success',
        title: t('admin.userDeleted'),
        message: t('admin.userDeletedMessage', 'User has been deleted successfully')
      });
    } catch (err) {
      console.error('Delete error:', err);
      addNotification({
        type: 'error',
        title: t('admin.deleteFailed'),
        message: err.message || t('admin.deleteFailedMessage', 'Failed to delete user. Please try again.')
      });
    } finally {
      setActionLoading(false);
    }
  };

  const openEditDialog = (user) => {
    setSelectedUser(user);
    setEditForm({
      full_name: user.full_name || '',
      email: user.email || '',
      role: user.role || '',
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error('Failed to update user');
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditDialogOpen(false);
      addNotification({
        type: 'success',
        title: t('admin.userUpdated'),
        message: t('admin.userUpdatedMessage')
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: t('admin.updateFailed'),
        message: t('admin.updateFailedMessage')
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error('Failed to change role');
      const updated = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      addNotification({
        type: 'success',
        title: t('admin.roleUpdated'),
        message: `${t('admin.roleUpdatedMessage')} ${newRole}.`
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: t('admin.roleChangeFailed'),
        message: t('admin.roleChangeFailedMessage')
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegisterTrainer = async (e) => {
    e.preventDefault();
    
    // Frontend validation
    if (registerForm.password !== registerForm.confirmPassword) {
      addNotification({
        type: 'error',
        title: t('admin.registrationFailedTitle'),
        message: t('admin.passwordsDoNotMatch')
      });
      return;
    }
    
    setActionLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/auth/register/trainer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...registerForm,
          role: 'TRAINER'
        }),
      });

      if (response.ok) {
        addNotification({
          type: 'success',
          title: t('admin.trainerRegistered'),
          message: t('admin.trainerRegisteredMessage')
        });
        setRegisterDialogOpen(false);
        setRegisterForm({ username: '', email: '', password: '', confirmPassword: '', full_name: '', role: 'trainer' });
        fetchUsers(); // Refresh the users list
      } else {
        let errorMsg = t('admin.registrationFailedMessage');
        try {
          const errorData = await response.json();
          // Handle FastAPI validation errors - detail can be an array or string
          if (errorData.detail) {
            if (Array.isArray(errorData.detail)) {
              errorMsg = errorData.detail.map((e: any) => {
                const field = Array.isArray(e.loc) ? e.loc.slice(1).join('.') : 'field';
                return `${field}: ${e.msg}`;
              }).join('; ');
            } else {
              errorMsg = String(errorData.detail);
            }
          }
        } catch (jsonErr) {
          errorMsg = 'Failed to parse error response';
        }
        addNotification({
          type: 'error',
          title: t('admin.registrationFailedTitle'),
          message: errorMsg
        });
      }
    } catch (error) {
      console.error('Registration error:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      addNotification({
        type: 'error',
        title: t('admin.registrationError'),
        message: t('admin.registrationErrorMessage') + ': ' + errorMsg
      });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  if (!user || user.role !== 'ADMIN') {
    return (
      <Layout currentPage="users">
        <div className="max-w-2xl mx-auto py-20 text-center text-lg font-bold text-red-500">
          {t('admin.accessDenied')}
        </div>
      </Layout>
    );
  }

  return (
    <Layout currentPage="users">
      <div className="max-w-6xl mx-auto py-8 px-4 w-full overflow-x-hidden">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t('admin.users')}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <Input
                placeholder={t('admin.searchUsersPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:max-w-xs"
              />
              <Button 
                onClick={() => setRegisterDialogOpen(true)}
                className="gradient-orange hover:gradient-orange-dark text-background font-semibold w-full sm:w-auto"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {t('admin.registerTrainer')}
              </Button>
            </div>
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin w-8 h-8 text-muted-foreground" /></div>
            ) : error ? (
              <div className="text-red-500 font-semibold text-center py-8">{error}</div>
            ) : (
              <>
                {/* Mobile View - Compact Cards (NO TABLE, NO SLIDER) */}
                <div className="xl:hidden space-y-2">
                  {filteredUsers.map((u) => (
                    <Card key={u.id} className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <p className="font-semibold text-sm truncate flex-1 min-w-0">{u.username}</p>
                          <Select
                            value={u.role}
                            onValueChange={(val) => handleRoleChange(u.id, val)}
                            disabled={actionLoading}
                          >
                            <SelectTrigger className="h-7 w-20 text-xs px-2 shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEditDialog(u)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDelete(u.id)} disabled={actionLoading}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Desktop View - Full Table (ONLY ON EXTRA LARGE SCREENS) */}
                <div className="hidden xl:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('admin.username')}</TableHead>
                        <TableHead>{t('admin.email')}</TableHead>
                        <TableHead>{t('admin.fullName')}</TableHead>
                        <TableHead>{t('admin.role')}</TableHead>
                        <TableHead>{t('admin.status')}</TableHead>
                        <TableHead>{t('admin.created')}</TableHead>
                        <TableHead>{t('admin.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell>{u.username}</TableCell>
                          <TableCell>{u.email}</TableCell>
                          <TableCell>{u.full_name}</TableCell>
                          <TableCell>
                            <Select
                              value={u.role}
                              onValueChange={(val) => handleRoleChange(u.id, val)}
                              disabled={actionLoading}
                            >
                              <SelectTrigger className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {roleOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {u.is_active ? (
                              <Badge className="bg-green-500/20 text-green-700 border-green-500/30">{t('admin.active')}</Badge>
                            ) : (
                              <Badge className="bg-red-500/20 text-red-700 border-red-500/30">{t('admin.inactive')}</Badge>
                            )}
                          </TableCell>
                          <TableCell>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}</TableCell>
                          <TableCell className="space-x-2">
                            <Button size="icon" variant="ghost" onClick={() => openEditDialog(u)}><Pencil className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => handleDelete(u.id)} disabled={actionLoading}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Edit User Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{t('admin.editUser')}</DialogTitle>
              <DialogDescription>{t('admin.updateUserDetails')}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">{t('admin.fullName')}</Label>
                <Input
                  id="full_name"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('admin.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">{t('admin.role')}</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(val) => setEditForm({ ...editForm, role: val })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)} className="flex-1">{t('admin.cancel')}</Button>
                <Button type="submit" className="flex-1 gradient-orange text-background" disabled={actionLoading}>
                  {actionLoading ? t('admin.saving') : t('admin.saveChanges')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Register Trainer Dialog */}
        <Dialog open={registerDialogOpen} onOpenChange={setRegisterDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{t('admin.registerNewTrainer')}</DialogTitle>
              <DialogDescription>{t('admin.registerNewTrainerDesc')}</DialogDescription>
            </DialogHeader>
            <form onSubmit={e => { 
              e.preventDefault(); 
              if (registerForm.password !== registerForm.confirmPassword) { 
                setPasswordError(t('admin.passwordsDoNotMatch')); 
                return; 
              } 
              setPasswordError(''); 
              handleRegisterTrainer(e); 
            }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t('admin.username')}</Label>
                <Input
                  id="username"
                  value={registerForm.username}
                  onChange={(e) => setRegisterForm({...registerForm, username: e.target.value})}
                  placeholder={t('admin.enterUsername')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('admin.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({...registerForm, email: e.target.value})}
                  placeholder={t('admin.enterEmail')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="full_name">{t('admin.fullName')}</Label>
                <Input
                  id="full_name"
                  value={registerForm.full_name}
                  onChange={(e) => setRegisterForm({...registerForm, full_name: e.target.value})}
                  placeholder={t('admin.enterFullName')}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('admin.password')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={registerForm.password}
                    onChange={e => setRegisterForm({ ...registerForm, password: e.target.value })}
                    placeholder={t('admin.enterPassword')}
                    className="pl-10 pr-3 text-right"
                    required
                  />
                  <button type="button" className="absolute left-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 flex items-center justify-center hover:bg-transparent" onClick={() => setShowPassword(v => !v)}>
                    {showPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('admin.confirmPassword')}</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={registerForm.confirmPassword}
                    onChange={e => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                    placeholder={t('admin.reEnterPassword')}
                    className="pl-10 pr-3 text-right"
                    required
                  />
                  <button type="button" className="absolute left-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 flex items-center justify-center hover:bg-transparent" onClick={() => setShowConfirmPassword(v => !v)}>
                    {showConfirmPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              {passwordError && <div className="text-red-500 text-sm">{passwordError}</div>}
              <div className="flex space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setRegisterDialogOpen(false)} className="flex-1">
                  {t('admin.cancel')}
                </Button>
                <Button type="submit" className="flex-1 gradient-orange text-background" disabled={actionLoading}>
                  {actionLoading ? t('admin.registering') : t('admin.registerTrainer')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default UsersPage; 