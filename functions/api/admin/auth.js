import handler from '../../../api/admin/auth.js';
import { adaptHandler } from '../../_lib/adapter.js';

export const onRequest = adaptHandler(handler);
