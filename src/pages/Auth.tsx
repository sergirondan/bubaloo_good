
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/");
      }
    };
    
    checkSession();
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!email || !password) {
        throw new Error("Please enter both email and password");
      }

      if (password.length < 6) {
        throw new Error("Password must be at least 6 characters long");
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error("Please enter a valid email address");
      }

      const authAction = isSignUp
        ? supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin
            }
          })
        : supabase.auth.signInWithPassword({
            email,
            password,
          });

      const { data: { user }, error } = await authAction;

      if (error) {
        if (error.message === "Invalid login credentials") {
          throw new Error(
            isSignUp
              ? "Error creating account. Please try again."
              : "Invalid email or password. Please try signing up if you don't have an account."
          );
        }
        throw error;
      }

      if (user) {
        toast({
          title: `Successfully ${isSignUp ? "signed up" : "signed in"}!`,
          description: isSignUp
            ? "Please check your email for verification."
            : "Welcome back!",
        });
        navigate("/");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 bg-gradient-to-br from-purple-50 to-white">
      <div className="max-w-md mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">
            {isSignUp ? "Create an account" : "Welcome back"}
          </h1>
          <p className="text-gray-600">
            {isSignUp
              ? "Sign up to start generating AI images"
              : "Sign in to continue generating AI images"}
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <span className="loading-dots">
                  {isSignUp ? "Signing up" : "Signing in"}
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              ) : isSignUp ? (
                "Sign Up"
              ) : (
                "Sign In"
              )}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                {isSignUp
                  ? "Already have an account? Sign in"
                  : "Don't have an account? Sign up"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
