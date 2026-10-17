import handler from '../../api/coupons.js';
import { adaptHandler } from '../_lib/adapter.js';

export const onRequest = adaptHandler(handler);
