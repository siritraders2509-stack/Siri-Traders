// No standalone api/admin/users.js exists — this logic lives inside
// api/admin/orders.js, reached on Vercel via a vercel.json rewrite
// (/api/admin/users -> /api/admin/orders?resource=users). Recreates that by
// injecting the same query param before dispatching.
import handler from '../../../api/admin/orders.js';
import { adaptHandlerWithQuery } from '../../_lib/adapter.js';

export const onRequest = adaptHandlerWithQuery(handler, { resource: 'users' });
