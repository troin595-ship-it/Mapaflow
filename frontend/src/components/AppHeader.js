import { useCallback, useEffect, useState } from "react";
import { Loader2, LogOut, Navigation2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

function UsersDialog({ open, onOpenChange, me }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "tecnico" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get("/users").then((r) => setUsers(r.data)).catch((e) => toast.error(apiError(e))), []);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/users", form);
      toast.success("Usuário criado");
      setForm({ name: "", email: "", password: "", role: "tecnico" });
      load();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id) => {
    try {
      await api.delete(`/users/${id}`);
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rf-glass-solid border-white/10 text-slate-100 max-w-lg" data-testid="users-dialog">
        <DialogHeader><DialogTitle className="text-white">Técnicos e acessos</DialogTitle></DialogHeader>
        <form onSubmit={create} className="grid grid-cols-2 gap-2">
          <input className="rf-input col-span-2" placeholder="Nome" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="user-name-input" />
          <input className="rf-input" type="email" placeholder="E-mail" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="user-email-input" />
          <input className="rf-input" type="password" placeholder="Senha (mín. 6)" minLength={6} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="user-password-input" />
          <select className="rf-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="user-role-select">
            <option value="tecnico">Técnico</option>
            <option value="admin">Administrador</option>
          </select>
          <button className="rf-btn-primary rounded-xl h-10 text-sm" disabled={busy} data-testid="user-create-button">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
          </button>
        </form>
        <div className="mt-2 space-y-1.5 max-h-72 overflow-y-auto">
          {users.map((u, i) => (
            <div key={u.id} className="flex items-center gap-3 rounded-xl px-3 py-2 bg-white/[0.04]" data-testid={`user-row-${i}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{u.name} <span className="rf-chip rf-chip-muted ml-1">{u.role === "admin" ? "Admin" : "Técnico"}</span></p>
                <p className="text-xs text-slate-400 truncate">{u.email}</p>
              </div>
              {u.id !== me.id && <button onClick={() => remove(u.id)} aria-label="Remover" data-testid={`user-delete-${i}`}><Trash2 className="h-4 w-4 text-slate-500 hover:text-rose-400" /></button>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AppHeader() {
  const { user, logout } = useAuth();
  const [usersOpen, setUsersOpen] = useState(false);
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-xl bg-blue-600 grid place-items-center shadow-lg shadow-blue-600/30">
          <Navigation2 className="h-4 w-4 text-white" fill="white" />
        </div>
        <div className="leading-tight">
          <p className="font-extrabold text-white tracking-tight">RotaFlow</p>
          <p className="text-[11px] text-slate-400">Roteiros e navegação</p>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button data-testid="user-menu-button" className="h-9 w-9 rounded-full bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-colors">
            {(user.name || user.email)[0].toUpperCase()}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rf-glass-solid border-white/10 text-slate-100">
          <div className="px-2 py-1.5 text-xs text-slate-400">{user.email}</div>
          {user.role === "admin" && (
            <DropdownMenuItem data-testid="menu-users" onClick={() => setUsersOpen(true)}><Users className="h-4 w-4 mr-2" />Técnicos</DropdownMenuItem>
          )}
          <DropdownMenuItem data-testid="logout-button" onClick={logout}><LogOut className="h-4 w-4 mr-2" />Sair</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {user.role === "admin" && <UsersDialog open={usersOpen} onOpenChange={setUsersOpen} me={user} />}
    </div>
  );
}
