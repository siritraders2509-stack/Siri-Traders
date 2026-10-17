import handler from '../../api/categories.js';
import { adaptHandler } from '../_lib/adapter.js';

export const onRequest = adaptHandler(handler);
