import handler from '../../../api/admin/inventory.js';
import { adaptHandler } from '../../_lib/adapter.js';

export const onRequest = adaptHandler(handler);
