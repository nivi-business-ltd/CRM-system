import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await login(email.trim(), password);
    setLoading(false);
    if (!res.ok) toast.error(res.error || "Login failed");
    else toast.success("Welcome back!");
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-brand-navy text-white relative overflow-hidden">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute -left-16 bottom-10 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-3">
            <img src="/nivi-logo.png" alt="NIVI FINSERV" className="h-11 w-auto" data-testid="brand-logo" />
          </div>
        </div>
        <div className="relative z-10 space-y-4">
          <h1 className="text-4xl font-extrabold leading-tight font-display">
            Every client. <br /> Every deal. <br />
            <span className="text-emerald-400">In one secure place.</span>
          </h1>
          <p className="text-slate-300 text-base max-w-md">
            A private CRM for NIVI FINSERV — manage clients, track your pipeline and stay on top of
            follow-ups. Accessible only to you and your team.
          </p>
        </div>
        <p className="relative z-10 text-xs text-slate-400">© {new Date().getFullYear()} NIVI FINSERV</p>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex justify-center">
            <img src="/nivi-logo.png" alt="NIVI FINSERV" className="h-16 w-auto" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">Sign in</h2>
          <p className="text-sm text-slate-500 mt-1 mb-8">Enter your credentials to access the CRM.</p>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@nivifinserv.com"
                data-testid="login-email-input"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                data-testid="login-password-input"
                className="h-11"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              data-testid="login-submit-button"
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>
          <p className="text-xs text-slate-400 mt-6 text-center">
            New employees are added by the administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
