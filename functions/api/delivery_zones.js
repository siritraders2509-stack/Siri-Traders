import handler from '../../api/delivery_zones.js';
import { adaptHandler } from '../_lib/adapter.js';

export const onRequest = adaptHandler(handler);
