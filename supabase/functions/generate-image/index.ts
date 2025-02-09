
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Replicate from "https://esm.sh/replicate@0.25.2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY')
    if (!REPLICATE_API_KEY) {
      throw new Error('REPLICATE_API_KEY is not set')
    }

    // Get the user's JWT from the request headers
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');

    // Get user details from Supabase auth
    const userResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/auth/v1/user`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
        },
      }
    );

    const user = await userResponse.json();
    if (!user?.id) {
      throw new Error('Unauthorized');
    }

    // Get user's subscription
    const subscriptionResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/rest/v1/user_subscriptions?user_id=eq.${user.id}&select=*,subscription_tiers(*)`,
      {
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
        },
      }
    );

    const subscriptions = await subscriptionResponse.json();
    const activeSubscription = subscriptions[0];
    
    // If no subscription, use free tier
    const freeTierResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/rest/v1/subscription_tiers?price_id=eq.free_tier&select=*`,
      {
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
        },
      }
    );
    
    const [freeTier] = await freeTierResponse.json();
    const currentTier = activeSubscription?.subscription_tiers || freeTier;

    // Get current month's usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usageResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/get_monthly_image_generations`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id,
          start_date: startOfMonth.toISOString(),
        }),
      }
    );

    const usage = await usageResponse.json();
    const count = usage[0]?.count || 0;
    const features = typeof currentTier.features === 'string' 
      ? JSON.parse(currentTier.features) 
      : currentTier.features;

    // Check if user has reached their limit
    if (features.images_per_month !== null && count >= features.images_per_month) {
      throw new Error('Monthly image generation limit reached');
    }

    const { prompt } = await req.json();

    console.log("Generating image with prompt:", prompt);
    const replicate = new Replicate({
      auth: REPLICATE_API_KEY,
    });

    const output = await replicate.run(
      "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
      {
        input: {
          prompt,
          width: 768,
          height: 768,
          num_inference_steps: 25,
          apply_watermark: false,
          refine: "expert_ensemble_refiner"
        }
      }
    );

    // Log the generation in the database before returning the response
    await fetch(
      `${Deno.env.get('SUPABASE_URL')}/rest/v1/image_generations`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id,
          prompt,
          created_at: new Date().toISOString(),
        }),
      }
    );

    console.log("Generation response:", output);
    return new Response(JSON.stringify({ output }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error in generate-image function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
