import handler from '../../../api/admin/activity.js';
import { adaptHandler } from '../../_lib/adapter.js';

export const onRequest = adaptHandler(handler);
