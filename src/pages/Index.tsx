import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ImageGenerator from "@/components/ImageGenerator";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { startOfMonth } from "date-fns";
import { LogOut, ArrowUpCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface SubscriptionTier {
  name: string;
  features: {
    images_per_month: number | null;
  };
}

interface SubscriptionInfo {
  tier?: SubscriptionTier;
  current_period_end?: string;
}

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [usedGenerations, setUsedGenerations] = useState<number>(0);
  const { toast } = useToast();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Error checking session:", error);
        navigate("/auth");
        return;
      }
      
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        fetchSubscriptionInfo(session.user.id);
        fetchGenerationsCount(session.user.id);
      }
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        fetchSubscriptionInfo(session.user.id);
        fetchGenerationsCount(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error signing out:", error);
        toast({
          title: "Error signing out",
          description: "Please try again",
          variant: "destructive",
        });
        return;
      }
      navigate("/auth");
    } catch (error) {
      console.error("Error signing out:", error);
      toast({
        title: "Error signing out",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const fetchSubscriptionInfo = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_subscriptions")
      .select("*, subscription_tiers(*)")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching subscription:", error);
      return;
    }

    if (data) {
      const tierFeatures = typeof data.subscription_tiers.features === 'string' 
        ? JSON.parse(data.subscription_tiers.features) 
        : data.subscription_tiers.features;

      setSubscription({
        tier: {
          name: data.subscription_tiers.name,
          features: {
            images_per_month: tierFeatures.images_per_month
          }
        },
        current_period_end: data.current_period_end,
      });
    } else {
      // If no subscription found, set to free tier
      const { data: freeTier } = await supabase
        .from("subscription_tiers")
        .select("*")
        .eq("name", "Free")
        .single();

      if (freeTier) {
        const features = typeof freeTier.features === 'string' 
          ? JSON.parse(freeTier.features) 
          : freeTier.features;

        setSubscription({
          tier: {
            name: freeTier.name,
            features: {
              images_per_month: features.images_per_month
            }
          }
        });
      }
    }
  };

  const fetchGenerationsCount = async (userId: string) => {
    const { data, error } = await supabase.rpc(
      'get_monthly_image_generations',
      {
        user_id: userId,
        start_date: format(startOfMonth(new Date()), 'yyyy-MM-dd')
      }
    );

    if (error) {
      console.error("Error fetching generations count:", error);
      return;
    }

    if (data && data[0]) {
      setUsedGenerations(data[0].count);
    }
  };

  const getRemainingGenerations = () => {
    if (!subscription?.tier?.features.images_per_month) {
      return "Unlimited";
    }
    const remaining = subscription.tier.features.images_per_month - usedGenerations;
    return Math.max(0, remaining);
  };

  if (!user) return null;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-purple-900">AI Image Generator</h1>
        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={handleSignOut}
            className="flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
          <Button
            onClick={() => navigate("/pricing")}
            className="flex items-center gap-2"
          >
            <ArrowUpCircle className="w-4 h-4" />
            Upgrade Plan
          </Button>
        </div>
      </div>
      
      <Card className="mb-8 p-6 bg-gradient-to-br from-purple-50 to-white shadow-md rounded-xl border border-purple-100">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-purple-900">{subscription?.tier?.name || "Free"} Plan</h2>
            <p className="text-purple-700">
              {subscription?.current_period_end 
                ? `Renews on ${format(new Date(subscription.current_period_end), 'MMMM d, yyyy')}`
                : "Monthly plan"}
            </p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-xl font-semibold text-purple-900">
              {getRemainingGenerations()} generations remaining
            </p>
            <p className="text-sm text-purple-700">
              Used {usedGenerations} this month
            </p>
          </div>
        </div>
      </Card>

      <ImageGenerator onGenerationComplete={() => setUsedGenerations(prev => prev + 1)} />
    </div>
  );
};

export default Index;
