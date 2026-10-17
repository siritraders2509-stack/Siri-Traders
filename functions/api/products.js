import handler from '../../api/products.js';
import { adaptHandler } from '../_lib/adapter.js';

export const onRequest = adaptHandler(handler);
