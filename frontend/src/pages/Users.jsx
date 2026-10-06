import React, { useState, useEffect } from 'react';
import { Users, ShieldCheck, Search, Trash2, RefreshCw, Crown, FlaskConical, Code2, Plus, Pencil, X } from 'lucide-react';
import { usersApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

const ROLES = ['ADMIN', 'QA_LEAD', 'QA_ENGINEER', 'DEVELOPER'];
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];

const emptyForm = {
  firstName: '', lastName: '', username: '', email: '',
  phoneNumber: '', gender: '', role: 'QA_ENGINEER',
  password: '', verifyPassword: '',
};

const roleStyle = (role) => {
  const r = (role || '').replace('ROLE_', '');
  if (r === 'ADMIN') return 'bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-glow';
  if (r === 'QA_LEAD') return 'bg-violet-50 text-violet-700 border border-violet-200';
  if (r === 'DEVELOPER') return 'bg-sky-50 text-sky-700 border border-sky-200';
  return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
};

const displayName = (u) => {
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return full || u.username;
};

export const UsersPage = () => {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null); // { mode: 'create' | 'edit', id? }
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const isAdmin = (me?.role || '').includes('ADMIN');

  const fetchUsers = async () => {
    try {
      const res = await usersApi.getAll();
      setUsers(res.data || []);
    } catch (e) {
      const status = e.response?.status;
      setNotice(status === 401 || status === 403
        ? 'Session expired or invalid — log out and sign in again (admin: fulladmin919).'
        : 'Could not load team members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setFormError('');
    setModal({ mode: 'create' });
  };

  const openEdit = (u) => {
    setForm({
      firstName: u.firstName || '', lastName: u.lastName || '',
      username: u.username || '', email: u.email || '',
      phoneNumber: u.phoneNumber || '', gender: u.gender || '',
      role: (u.role || 'QA_ENGINEER').replace('ROLE_', ''),
      password: '', verifyPassword: '',
    });
    setFormError('');
    setModal({ mode: 'edit', id: u.id });
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.username.trim()) return setFormError('Username is required.');
    if (!form.email.trim()) return setFormError('Email is required.');
    if (modal.mode === 'create') {
      if ((form.password || '').length < 6) return setFormError('Password must be at least 6 characters.');
      if (form.password !== form.verifyPassword) return setFormError('Passwords do not match.');
    } else if (form.password || form.verifyPassword) {
      if (form.password.length < 6) return setFormError('Password must be at least 6 characters.');
      if (form.password !== form.verifyPassword) return setFormError('Passwords do not match.');
    }
    setSaving(true);
    try {
      const payload = {
        firstName: form.firstName.trim(), lastName: form.lastName.trim(),
        username: form.username.trim(), email: form.email.trim(),
        phoneNumber: form.phoneNumber.trim(), gender: form.gender,
        role: form.role,
      };
      if (form.password) payload.password = form.password;
      let saved;
      if (modal.mode === 'create') {
        saved = (await usersApi.create(payload)).data;
        setUsers((prev) => [saved, ...prev]);
        setNotice(`${saved.username} created.`);
      } else {
        saved = (await usersApi.update(modal.id, payload)).data;
        setUsers((prev) => prev.map((u) => (u.id === modal.id ? saved : u)));
        setNotice(`${saved.username} updated.`);
      }
      setModal(null);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (id, role) => {
    setNotice('');
    try {
      const res = await usersApi.updateRole(id, role);
      setUsers((prev) => prev.map((u) => (u.id === id ? res.data : u)));
      setNotice('Role updated.');
    } catch (e) {
      setNotice(e.response?.data?.message || 'Role update failed (admin only).');
    }
  };

  const removeUser = async (id, username) => {
    if (!window.confirm(`Remove ${username} from the workspace?`)) return;
    setNotice('');
    try {
      await usersApi.remove(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setNotice(`${username} removed.`);
    } catch (e) {
      setNotice(e.response?.data?.message || 'Delete failed (admin only).');
    }
  };

  const filtered = users.filter((u) =>
    [u.firstName, u.lastName, u.username, u.email, u.phoneNumber, u.gender, u.role]
      .filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())
  );
  const admins = users.filter((u) => (u.role || '').includes('ADMIN')).length;

  const inputCls = 'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition-all';
  const labelCls = 'block text-[11px] font-bold text-slate-600 uppercase tracking-[0.14em] mb-1.5';

  return (
    <div className="p-8 pt-4 max-w-7xl mx-auto space-y-7">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-violet-600 via-indigo-600 to-sky-500 p-7 shadow-glow-lg">
        <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-white/25 blur-[90px]" />
        <div className="absolute -bottom-24 left-1/3 w-72 h-72 rounded-full bg-cyan-200/50 blur-[90px]" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white bg-white/15 border border-white/25 rounded-full px-3 py-1">
              <Users className="w-3.5 h-3.5" />
              Workspace · {users.length} members
            </span>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white">Everyone building quality.</h1>
            <p className="mt-1.5 text-sm text-indigo-50/90">
              {isAdmin ? 'Create, edit, assign roles or remove members.' : 'Browse the team. Changes need an admin.'}
            </p>
          </div>
          <div className="sm:ml-auto flex items-center gap-2">
            {isAdmin ? (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-slate-950 text-sm font-bold rounded-xl shadow-glow hover:bg-sky-100 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>New User</span>
              </button>
            ) : (
              <button
                onClick={() => setNotice('Only admins can create users — log out and sign in as an admin (e.g. fulladmin919).')}
                title="Only admins can create users — sign in as an admin"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/40 border border-white/40 text-white/90 text-sm font-bold rounded-xl cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New User · admin only</span>
              </button>
            )}
            <button
              onClick={() => { setLoading(true); fetchUsers(); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/15 border border-white/25 text-white text-sm font-bold rounded-xl hover:bg-white/25 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {[
          { label: 'Total Members', value: users.length, grad: 'from-sky-400 to-blue-600', icon: Users },
          { label: 'Administrators', value: admins, grad: 'from-amber-400 to-orange-600', icon: Crown },
          { label: 'Engineers & Devs', value: users.length - admins, grad: 'from-emerald-400 to-teal-600', icon: FlaskConical },
        ].map((s) => (
          <div key={s.label} className="glass card-lift border border-slate-200/80 p-5 rounded-2xl shadow-card flex items-center gap-4">
            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${s.grad} flex items-center justify-center text-white shadow-glow`}>
              <s.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="font-display text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.16em]">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white/85 border border-slate-200 rounded-2xl overflow-hidden shadow-card">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 shadow-glow">
              <ShieldCheck className="w-4 h-4 text-white" />
            </span>
            <h2 className="text-base font-bold text-slate-900">Team members</h2>
          </div>
          <label className="sm:ml-auto flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm w-full sm:w-72 focus-within:border-sky-400 transition-colors">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, role…"
              className="bg-transparent outline-none text-slate-800 w-full text-sm placeholder:text-slate-400"
            />
          </label>
        </div>

        {notice && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 text-xs font-semibold">{notice}</div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100/80 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-6 py-3.5">Member</th>
                <th className="px-6 py-3.5">Email</th>
                <th className="px-6 py-3.5">Phone</th>
                <th className="px-6 py-3.5">Gender</th>
                <th className="px-6 py-3.5">Role</th>
                <th className="px-6 py-3.5">Joined</th>
                {isAdmin && <th className="px-6 py-3.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-600">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-400 italic">Loading team…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-400 italic">No members found.</td></tr>
              ) : filtered.map((u) => (
                <tr key={u.id} className="hover:bg-sky-50/60 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-fuchsia-600 flex items-center justify-center text-white font-bold text-sm shadow-glow">
                        {(displayName(u) || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{displayName(u)}</p>
                        <p className="text-[11px] text-slate-400 font-mono">@{u.username}</p>
                      </div>
                      {me?.username === u.username && (
                        <span className="text-[10px] font-bold text-sky-600 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded">YOU</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 font-mono text-xs">{u.email}</td>
                  <td className="px-6 py-4 text-slate-500 font-mono text-xs">{u.phoneNumber || '—'}</td>
                  <td className="px-6 py-4 text-xs text-slate-500">{u.gender || '—'}</td>
                  <td className="px-6 py-4">
                    {isAdmin ? (
                      <select
                        value={(u.role || '').replace('ROLE_', '')}
                        onChange={(e) => changeRole(u.id, e.target.value)}
                        className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : (
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg ${roleStyle(u.role)}`}>
                        {(u.role || '').replace('ROLE_', '')}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500 font-mono">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(u)}
                        title="Edit user"
                        className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeUser(u.id, u.username)}
                        title="Remove user"
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div
            className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-glow-lg p-7 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display text-xl font-bold text-slate-900">
                {modal.mode === 'create' ? 'Create team member' : 'Edit team member'}
              </h3>
              <button onClick={() => setModal(null)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              {modal.mode === 'create' ? 'They can sign in immediately with this password.' : 'Leave password blank to keep the current one.'}
            </p>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold">{formError}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>First name</label><input value={form.firstName} onChange={set('firstName')} placeholder="Alex" className={inputCls} /></div>
                <div><label className={labelCls}>Last name</label><input value={form.lastName} onChange={set('lastName')} placeholder="Morgan" className={inputCls} /></div>
              </div>
              <div><label className={labelCls}>Username *</label><input value={form.username} onChange={set('username')} placeholder="alex_tester" className={inputCls} /></div>
              <div><label className={labelCls}>Email *</label><input type="email" value={form.email} onChange={set('email')} placeholder="alex@company.com" className={inputCls} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Phone number</label><input value={form.phoneNumber} onChange={set('phoneNumber')} placeholder="+1 555 0100" className={inputCls} /></div>
                <div>
                  <label className={labelCls}>Gender</label>
                  <select value={form.gender} onChange={set('gender')} className={inputCls}>
                    <option value="">Select…</option>
                    {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Role</label>
                <select value={form.role} onChange={set('role')} className={inputCls}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>{modal.mode === 'create' ? 'Password *' : 'New password'}</label><input type="password" value={form.password} onChange={set('password')} placeholder="••••••••" className={inputCls} /></div>
                <div><label className={labelCls}>Verify password</label><input type="password" value={form.verifyPassword} onChange={set('verifyPassword')} placeholder="••••••••" className={inputCls} /></div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)} className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-sm font-semibold transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-sky-500 via-blue-600 to-violet-600 hover:from-sky-400 hover:to-violet-500 shadow-glow disabled:opacity-50 transition-all">
                  {saving ? 'Saving…' : modal.mode === 'create' ? 'Create User' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
