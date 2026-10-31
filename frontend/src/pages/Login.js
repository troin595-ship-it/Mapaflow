import { useState } from "react";
import { motion } from "framer-motion";
import { Navigation2, Loader2, LockKeyhole, Mail, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "register") await register(name.trim(), email.trim(), password);
      else await login(email.trim(), password);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rf-login min-h-[100dvh] flex items-center justify-center lg:justify-start px-5 lg:px-24" data-testid="login-page">
      <div className="rf-login-grid" aria-hidden />
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 22 }}
        className="relative w-full max-w-md rf-glass rounded-3xl p-8 sm:p-10"
      >
        <div className="flex items-center gap-3 mb-10">
          <div className="h-11 w-11 rounded-2xl bg-blue-600 grid place-items-center shadow-lg shadow-blue-600/30">
            <Navigation2 className="h-5 w-5 text-white" fill="white" />
          </div>
          <div>
            <p className="font-extrabold text-white tracking-tight text-lg">RotaFlow</p>
            <p className="text-xs text-slate-400">Belo Horizonte</p>
          </div>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">{mode === "register" ? "Criar conta" : "Acesso do técnico"}</h1>
        <p className="mt-3 text-sm text-slate-400">Roteiros, rotas reais e navegação em tempo real.</p>

        {mode === "register" && (
          <>
            <label className="block mt-8 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nome</label>
            <div className="rf-field mt-2">
              <User className="h-4 w-4 text-slate-500" />
              <input data-testid="register-name-input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
            </div>
          </>
        )}
        <label className={`block ${mode === "register" ? "mt-5" : "mt-8"} text-xs font-semibold text-slate-400 uppercase tracking-wider`}>E-mail</label>
        <div className="rf-field mt-2">
          <Mail className="h-4 w-4 text-slate-500" />
          <input data-testid="login-email-input" type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" />
        </div>
        <label className="block mt-5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Senha</label>
        <div className="rf-field mt-2">
          <LockKeyhole className="h-4 w-4 text-slate-500" />
          <input data-testid="login-password-input" type="password" required minLength={mode === "register" ? 6 : 1} autoComplete={mode === "register" ? "new-password" : "current-password"} value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        {error && <p data-testid="login-error" className="mt-4 text-sm text-rose-400">{error}</p>}
        <button data-testid="login-submit-button" type="submit" disabled={loading}
          className="rf-btn-primary w-full mt-8 h-12 rounded-2xl text-base">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : mode === "register" ? "Criar conta e entrar" : "Entrar"}
        </button>
        <button type="button" data-testid="toggle-auth-mode" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
          className="mt-6 text-sm text-slate-400 hover:text-white transition-colors">
          {mode === "login" ? <>Não tem conta? <span className="text-blue-400 font-semibold">Criar conta</span></> : <>Já tem conta? <span className="text-blue-400 font-semibold">Entrar</span></>}
        </button>
      </motion.form>
    </div>
  );
}
