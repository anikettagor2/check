"use client";

import { useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Loader2, Film, Check, User, PenTool, ArrowRight } from "lucide-react";
import Link from "next/link";
import { SnowBackground } from "@/components/snow-background";
import { UserRole } from "@/types/schema";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import Image from "next/image";
import { useBranding } from "@/lib/context/branding-context";

export default function SignupPage() {
  const { signInWithGoogle, signupWithEmail, loading } = useAuth();
  const { logoUrl } = useBranding();
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>("client");
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // Editor Experience Meta
  const [whatsapp, setWhatsapp] = useState("");
  const [portfolio, setPortfolio] = useState("");


  const handleGoogleSignup = async () => {
    if (!name || !password) {
        setError("A Full Name and Password are required for dashboard access. Please enter them above before using Google Sign-up.");
        return;
    }

    if (selectedRole === 'editor' && (!whatsapp || !portfolio)) {
        setError("Please provide WhatsApp and Portfolio details before proceeding with Google Sign-Up.");
        return;
    }

    // Validate editor WhatsApp number
    if (selectedRole === 'editor' && whatsapp.length !== 10) {
        setError("WhatsApp number must be exactly 10 digits");
        return;
    }

    setIsSigningUp(true);
    setError(null);
    try {
      const metadata: any = { displayName: name };
      if (selectedRole === 'editor') {
          metadata.whatsappNumber = `+91${whatsapp}`;
          metadata.portfolio = [{ name: "Main Portfolio", url: portfolio, date: Date.now() }];
      }
      
      await signInWithGoogle(selectedRole, password, metadata);
    } catch (error: any) {
      console.error("Signup failed", error);
      setError(error.message || "Signup failed. Please try again.");
    } finally {
      setIsSigningUp(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !phone) {
        setError("Please fill in all mandatory fields (Name, Email, Phone, Password)");
        return;
    }
    
    // Validate phone number is exactly 10 digits
    if (phone.length !== 10) {
        setError("Phone number must be exactly 10 digits");
        return;
    }

    // Validate editor WhatsApp number
    if (selectedRole === 'editor' && whatsapp.length !== 10) {
        setError("WhatsApp number must be exactly 10 digits");
        return;
    }
    
    setIsSigningUp(true);
    setError(null);
    try {
        const metadata = {
            phoneNumber: `+91${phone}`,
            ...(selectedRole === 'editor' ? {
                whatsappNumber: `+91${whatsapp}`,
                portfolio: [{ name: "Main Portfolio", url: portfolio, date: Date.now() }],
                initialPassword: password
            } : {})
        };
        await signupWithEmail(email, password, name, selectedRole, metadata);
    } catch (error: any) {
        console.error("Email signup failed", error);
        setError(error.message || "Signup failed. Please try again.");
    } finally {
        setIsSigningUp(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const roles = [
    {
      id: "client",
      title: "Client",
      icon: User,
      description: "I need videos edited"
    },
    {
      id: "editor",
      title: "Video Editor",
      icon: PenTool,
      description: "Join the team"
    }
  ];

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background text-foreground selection:bg-primary/30">
        <div className="absolute inset-0 z-0 opacity-40">
            <SnowBackground />
        </div>
      
      <div className="absolute top-[-20%] left-[-10%] h-[500px] w-[500px] rounded-full bg-primary/20 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[120px]" />

      <div className="z-10 w-full max-w-md space-y-8 px-6 py-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <Link href="/" className="inline-flex items-center justify-center mb-8 w-full">
            <div className="relative h-16 w-full flex items-center justify-center rounded-2xl overflow-hidden">
              {logoUrl ? (
                <Image 
                  src={logoUrl} 
                  alt="EditoHub Logo" 
                  fill 
                  className="object-contain"
                  priority
                />
              ) : (
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center font-bold text-primary-foreground italic text-xl shadow-[0_0_20px_rgba(var(--primary),0.3)]">E</div>
                    <span className="text-3xl font-heading font-black tracking-tighter">EDITO_HUB</span>
                </div>
              )}
            </div>
          </Link>
          
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Create Account
          </h1>
          <p className="mt-2 text-muted-foreground">
            Join the platform as a client or editor
          </p>
        </motion.div>

        <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="rounded-2xl border border-border bg-zinc-900/50 p-6 backdrop-blur-xl shadow-2xl space-y-6"
        >
          {/* Role Selection */}
          <div className="space-y-3">
              <Label className="text-foreground/80">I am a...</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRole(role.id as UserRole)}
                    className={cn(
                      "flex flex-col items-center gap-3 rounded-xl border p-4 transition-all text-center relative overflow-hidden group",
                      selectedRole === role.id 
                        ? "bg-primary/10 border-primary text-primary shadow-[0_0_20px_rgba(99,102,241,0.15)]" 
                        : "bg-black/5 dark:bg-black/40 border-border hover:bg-card text-muted-foreground hover:border-border"
                    )}
                  >
                    {selectedRole === role.id && (
                        <div className="absolute top-2 right-2 text-primary">
                            <Check className="h-4 w-4" />
                        </div>
                    )}
                    <div className={cn("p-3 rounded-full transition-colors", selectedRole === role.id ? "bg-primary/20 text-primary" : "bg-card text-muted-foreground group-hover:text-foreground/80")}>
                        <role.icon className="h-6 w-6" />
                    </div>
                    <div>
                        <span className="block font-semibold text-sm mb-0.5">{role.title}</span>
                        <span className="text-[10px] text-muted-foreground">{role.description}</span>
                    </div>
                  </button>
                ))}
            </div>
          </div>

          <form onSubmit={handleEmailSignup} className="space-y-3 pt-2 border-t border-border">
              <div className="space-y-1">
                  <Label className="text-foreground/80 text-xs uppercase tracking-wide">User Details</Label>
                  <Input 
                      placeholder="Full Name" 
                      className="bg-black/5 dark:bg-black/40 border-border text-foreground h-10"
                      value={name}
                      onChange={e => setName(e.target.value)}
                  />
                  <div className="flex gap-2 mt-2">
                      <div className="flex items-center justify-center h-10 px-3 bg-black/20 border border-border rounded-md text-sm text-muted-foreground">+91</div>
                      <Input 
                          type="tel"
                          placeholder="9876543210" 
                          className="bg-black/5 dark:bg-black/40 border-border text-foreground h-10 flex-1"
                          value={phone}
                          onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          maxLength={10}
                      />
                  </div>
              </div>

              {/* Role-Specific Fields */}
              {selectedRole === 'editor' && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-3 pt-2 border-t border-border"
                  >
                      <div className="space-y-1.5">
                          <Label className="text-muted-foreground text-[10px] uppercase tracking-wider font-bold">Professional Details</Label>
                          <div className="flex gap-2">
                              <div className="flex items-center justify-center h-10 px-3 bg-black/20 border border-border rounded-md text-sm text-muted-foreground">+91</div>
                              <Input 
                                  type="tel"
                                  placeholder="9876543210" 
                                  className="bg-black/5 dark:bg-black/40 border-border text-foreground h-10 flex-1"
                                  value={whatsapp}
                                  onChange={e => setWhatsapp(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                  maxLength={10}
                              />
                          </div>
                      </div>
                      <Input 
                          placeholder="Portfolio Link (Google Drive/YouTube/behance)" 
                          className="bg-black/5 dark:bg-black/40 border-border text-foreground h-10"
                          value={portfolio}
                          onChange={e => setPortfolio(e.target.value)}
                      />
                  </motion.div>
              )}

              <div className="grid grid-cols-1 gap-3">
                  <Input 
                      type="email"
                      placeholder="Email Address" 
                      className="bg-black/5 dark:bg-black/40 border-border text-foreground h-10"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                  />
                  <Input 
                      type="password"
                      placeholder="Create Password" 
                      className="bg-black/5 dark:bg-black/40 border-border text-foreground h-10"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                  />
              </div>
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 mt-2 text-primary-foreground font-semibold" disabled={isSigningUp}>
                  {isSigningUp ? "Creating Account..." : "Sign Up with Email"}
              </Button>
          </form>

          <div className="relative">
              <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-zinc-900 px-2 text-muted-foreground">Or continue with Google</span>
              </div>
          </div>

          <div className="space-y-4">
            <Button
                onClick={handleGoogleSignup}
                variant="outline"
                disabled={isSigningUp}
                className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl border-border bg-card px-4 py-4 text-foreground transition-all hover:bg-card"
            >
                {isSigningUp ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                        />
                        <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                        />
                        <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                        />
                        <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                        />
                    </svg>
                )}
                <span className="font-semibold">Sign up with Google</span>
            </Button>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                {error}
            </div>
          )}
            
        </motion.div>
        
        <p className="px-8 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="underline underline-offset-4 hover:text-primary font-medium text-foreground">
              Sign In
            </Link>
        </p>

        <div className="pb-8 text-center bg-transparent mt-4">
            <p className="text-xs text-muted-foreground">
               &copy; {new Date().getFullYear()} EditoHub. All rights reserved.
            </p>
        </div>
      </div>
    </main>
  );
}
