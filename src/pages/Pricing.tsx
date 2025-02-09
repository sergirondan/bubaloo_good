
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Check } from "lucide-react";

interface SubscriptionTier {
  id: string;
  name: string;
  description: string;
  amount: number;
  features: {
    images_per_month: number;
    resolution: string;
    priority_support?: boolean;
    custom_models?: boolean;
  };
}

const Pricing = () => {
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [currentSubscription, setCurrentSubscription] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        fetchCurrentSubscription(session.user.id);
      }
    };

    checkUser();
  }, [navigate]);

  useEffect(() => {
    const fetchTiers = async () => {
      const { data, error } = await supabase
        .from("subscription_tiers")
        .select("*");

      if (error) {
        toast({
          title: "Error fetching subscription tiers",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      // Transform the data to ensure features is properly parsed
      const transformedTiers: SubscriptionTier[] = data.map(tier => ({
        id: tier.id,
        name: tier.name,
        description: tier.description || "",
        amount: tier.amount,
        features: typeof tier.features === 'string' 
          ? JSON.parse(tier.features)
          : tier.features as SubscriptionTier['features']
      }));

      setTiers(transformedTiers);
    };

    fetchTiers();
  }, [toast]);

  const fetchCurrentSubscription = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_subscriptions")
      .select("*, subscription_tiers(*)")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      toast({
        title: "Error fetching subscription",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setCurrentSubscription(data);
  };

  const handleSubscribe = async (tierId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { tierId }
      });

      if (error) throw error;

      window.location.href = data.url;
    } catch (error: any) {
      toast({
        title: "Error creating checkout session",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen p-8 bg-gradient-to-br from-purple-50 to-white">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">Choose Your Plan</h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Select the perfect plan for your AI image generation needs. Upgrade or
            downgrade at any time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {tiers.map((tier) => (
            <Card key={tier.id} className="p-6 space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">{tier.name}</h2>
                <p className="text-gray-600">{tier.description}</p>
              </div>

              <div className="text-3xl font-bold">
                ${(tier.amount / 100).toFixed(2)}
                <span className="text-base font-normal text-gray-600">/month</span>
              </div>

              <ul className="space-y-3">
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>{tier.features.images_per_month} images per month</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  <span>{tier.features.resolution} resolution</span>
                </li>
                {tier.features.priority_support && (
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-500" />
                    <span>Priority support</span>
                  </li>
                )}
                {tier.features.custom_models && (
                  <li className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-500" />
                    <span>Custom models</span>
                  </li>
                )}
              </ul>

              <Button
                onClick={() => handleSubscribe(tier.id)}
                disabled={loading || (currentSubscription?.tier_id === tier.id)}
                className="w-full"
              >
                {currentSubscription?.tier_id === tier.id
                  ? "Current Plan"
                  : "Subscribe"}
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Pricing;
