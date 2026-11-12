import { waitUntil } from '@vercel/functions';
import { handleRequest } from '../src/runtime.js';

export default {
  fetch(request) {
    return handleRequest(request, { path: '/sepay/webhook', waitUntil });
  }
};
