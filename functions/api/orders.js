import handler from '../../api/orders.js';
import { adaptHandler } from '../_lib/adapter.js';

export const onRequest = adaptHandler(handler);
