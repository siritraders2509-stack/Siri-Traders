import { getSupabase, throwIfError } from '../db/supabase.js';
import { setCorsHeaders } from './_cors.js';
import { getAuthenticatedUserId, clerk } from './_clerkAuth.js';

// Upserts the signed-in Clerk user into the `users` table right after
// login/signup — previously a customer only showed up here once they placed
// their first order, so the admin's Customers/Broadcast lists silently
// missed anyone who'd only signed up or logged in.
export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.query;
  if (action !== 'sync') return res.status(404).json({ error: 'Not found' });

  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not signed in' });

    const clerkUser = await clerk.users.getUser(userId);
    const email = clerkUser.emailAddresses[0]?.emailAddress || '';
    if (!email) return res.status(200).json({ synced: false, reason: 'No email on account' });

    const name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || 'Customer';
    const phone = clerkUser.phoneNumbers[0]?.phoneNumber || '';

    const supabase = getSupabase();
    const { error } = await supabase.from('users').upsert({
      id: userId,
      email,
      name,
      phone,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    throwIfError(error);

    return res.status(200).json({ synced: true });
  } catch (error) {
    console.error('Error in /api/users?action=sync:', error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
