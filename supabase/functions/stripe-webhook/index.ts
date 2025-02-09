
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@13.7.0?target=deno";

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const updateSubscription = async (subscription: any) => {
  const { customer, status, current_period_end, cancel_at_period_end } = subscription;

  // Get the customer to find the Supabase user ID
  const stripeCustomer = await stripe.customers.retrieve(customer);
  const userId = stripeCustomer.metadata.supabaseUid;

  if (!userId) {
    throw new Error('No Supabase user ID found in customer metadata');
  }

  // Get the checkout session that created this subscription
  const sessions = await stripe.checkout.sessions.list({
    subscription: subscription.id,
    limit: 1,
  });
  const session = sessions.data[0];

  if (!session) {
    throw new Error('No checkout session found for subscription');
  }

  const tierId = session.metadata.tierId;

  // Update or create subscription in Supabase
  const response = await fetch(
    `${Deno.env.get('SUPABASE_URL')}/rest/v1/user_subscriptions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: userId,
        subscription_id: subscription.id,
        tier_id: tierId,
        status,
        current_period_end: new Date(current_period_end * 1000).toISOString(),
        cancel_at_period_end,
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to update subscription in Supabase');
  }
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const signature = req.headers.get('stripe-signature');
  
  if (!signature) {
    console.error('No signature found in request headers');
    return new Response('No signature', { 
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.text();
    console.log('Received webhook body:', body);
    
    const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    
    if (!endpointSecret) {
      console.error('STRIPE_WEBHOOK_SECRET is not set');
      throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    }

    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      endpointSecret
    );

    console.log('Webhook event type:', event.type);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await updateSubscription(event.data.object);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error processing webhook:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
