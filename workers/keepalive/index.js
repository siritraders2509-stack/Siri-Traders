// Standalone Worker — entirely separate from the Pages project (siri-traders-app).
// Its only job: hit Supabase's REST API once a day so the free-tier project
// never goes 7 days without activity and gets auto-paused. Runs on its own
// cron schedule, shares no code path with the site or admin panel, so it
// cannot affect either even if it fails.
export default {
  async scheduled(event, env, ctx) {
    const base = (env.SUPABASE_URL || '').replace(/\/+$/, '');
    if (!base || !env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('keepalive: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
      return;
    }

    try {
      // Hitting the bare REST root (returns the OpenAPI schema doc) counts
      // as real API activity against the project without depending on any
      // specific table being visible to PostgREST's schema cache.
      const res = await fetch(`${base}/rest/v1/`, {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
      const body = await res.text();
      console.log(`keepalive: Supabase REST ping -> ${res.status} ${body.slice(0, 300)}`);
    } catch (err) {
      console.error('keepalive: ping failed:', err.message);
    }
  },

  // Lets the ping be triggered manually (e.g. a one-off curl) to verify it
  // works, without waiting for the schedule.
  async fetch(request, env, ctx) {
    await this.scheduled(null, env, ctx);
    return new Response('ok');
  },
};
