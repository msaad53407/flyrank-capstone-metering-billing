import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowRight,
  KeyRound,
  Lock,
  LogIn,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  postDemoLogin,
  postLogin,
  postRegister,
  type AuthResult,
} from "@/lib/api";
import { useShell } from "@/lib/shell-context";

export function SignInPage() {
  const navigate = useNavigate();
  const { onTenantAuthenticated } = useShell();

  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  async function handleDemoLogin() {
    setDemoBusy(true);
    try {
      const res = await postDemoLogin();
      if (res.status === 200) {
        const data = res.body as AuthResult;
        onTenantAuthenticated(data.tenant, data.access_token);
        toast.success("Signed in as Demo Tenant! ⚡");
        navigate("/");
      } else {
        const body = res.body as { detail?: string };
        toast.error(body.detail ?? "Demo login failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Demo login failed");
    } finally {
      setDemoBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }
    setBusy(true);
    try {
      const res = await postLogin(email, password);
      if (res.status === 200) {
        const data = res.body as AuthResult;
        onTenantAuthenticated(data.tenant, data.access_token);
        toast.success(`Welcome back, ${data.tenant.name}!`);
        navigate("/");
      } else {
        const body = res.body as { detail?: string };
        toast.error(body.detail ?? `Sign in failed (${res.status})`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex size-12 items-center justify-center rounded-xl bg-primary text-xl font-mono font-bold text-primary-foreground shadow-lg shadow-primary/20">
            $
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your tenant account to manage metered usage and billing
          </p>
        </div>

        {/* Demo Fast-Track Card */}
        <Card className="border-primary/40 bg-gradient-to-br from-card via-card to-primary/5 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                <Zap className="size-4 text-amber-500" /> One-Click Demo Access
              </CardTitle>
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <Sparkles className="size-3 text-amber-500" /> Pre-configured
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Instant login as seeded tenant (<code className="text-foreground">{DEMO_EMAIL}</code>) with sample usage & Stripe test keys.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Button
              type="button"
              onClick={() => void handleDemoLogin()}
              disabled={demoBusy || busy}
              className="w-full gap-2 font-medium shadow-sm"
            >
              <Zap className="size-4" />
              {demoBusy ? "Authenticating…" : "Login as Demo Tenant"}
            </Button>
          </CardContent>
        </Card>

        {/* Regular Login Form */}
        <Card className="shadow-lg border-border/80">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                <KeyRound className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Credentials Sign In</CardTitle>
                <CardDescription className="text-xs">Authenticate via email and password</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">Contact Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs">Password</Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" disabled={busy || demoBusy} className="w-full gap-2">
                <LogIn className="size-4" />
                {busy ? "Signing in…" : "Sign In"}
              </Button>
            </form>

            <div className="mt-6 text-center text-xs text-muted-foreground">
              Don&apos;t have a tenant account?{" "}
              <Link
                to="/register"
                className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
              >
                Register organization
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ShieldCheck className="size-3.5 text-emerald-500" /> Bcrypt Hashing
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Lock className="size-3.5 text-primary" /> JWT Bearer Sessions
          </span>
        </div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { onTenantAuthenticated } = useShell();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await postRegister(name.trim(), email.trim(), password);
      if (res.status === 201) {
        const data = res.body as AuthResult;
        onTenantAuthenticated(data.tenant, data.access_token);
        toast.success(`Organization ${data.tenant.name} registered! 🎉`);
        navigate("/");
      } else {
        const body = res.body as { detail?: string };
        toast.error(body.detail ?? `Registration failed (${res.status})`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-4 py-12 text-foreground">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex size-12 items-center justify-center rounded-xl bg-primary text-xl font-mono font-bold text-primary-foreground shadow-lg shadow-primary/20">
            $
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Create Tenant Account</h1>
          <p className="text-sm text-muted-foreground">
            Set up an isolated workspace with Free tier quotas and Stripe billing
          </p>
        </div>

        <Card className="shadow-lg border-border/80">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                <UserPlus className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Tenant Details</CardTitle>
                <CardDescription className="text-xs">
                  All metrics, tokens, and billing are scoped to this account
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs">Organization Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. Acme AI Labs"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">Contact / Billing Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@acme.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-pass" className="text-xs">Confirm Password</Label>
                <Input
                  id="confirm-pass"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" disabled={busy} className="w-full gap-2">
                <span>{busy ? "Creating Tenant…" : "Create Account & Sign In"}</span>
                <ArrowRight className="size-4" />
              </Button>
            </form>

            <div className="mt-6 text-center text-xs text-muted-foreground">
              Already have a tenant account?{" "}
              <Link
                to="/sign-in"
                className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
              >
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Backward compatibility alias if needed
export { SignInPage as AuthPage };
