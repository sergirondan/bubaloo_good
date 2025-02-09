
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@13.7.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { tierId } = await req.json();
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');

    console.log('Creating checkout session for tier:', tierId);

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

    if (!userResponse.ok) {
      throw new Error('Failed to get user details');
    }

    const user = await userResponse.json();
    console.log('User retrieved:', user.id);

    // Get subscription tier details
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/rest/v1/subscription_tiers?id=eq.${tierId}&select=*`,
      {
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to get subscription tier details');
    }

    const [tier] = await response.json();
    if (!tier) {
      throw new Error('Subscription tier not found');
    }

    console.log('Tier retrieved:', tier);

    if (tier.price_id === 'free_tier') {
      throw new Error('Cannot create checkout session for free tier');
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2023-10-16',
    });

    // Create or get Stripe customer
    const customerResponse = await stripe.customers.list({
      email: user.email,
      limit: 1,
    });

    let customerId = customerResponse.data[0]?.id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabaseUid: user.id,
        },
      });
      customerId = customer.id;
    }

    console.log('Customer ID:', customerId);

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: tier.price_id,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.get('origin')}/`,
      cancel_url: `${req.headers.get('origin')}/pricing`,
      metadata: {
        supabaseUid: user.id,
        tierId: tier.id,
      },
    });

    console.log('Checkout session created:', session.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
