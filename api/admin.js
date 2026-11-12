import { waitUntil } from '@vercel/functions';
import { handleRequest } from '../src/runtime.js';

// Map Vercel rewrites for /admin and /admin/* to the shared Fetch handler.
export default {
  fetch(request) {
    const url=new URL(request.url);
    const suffix=url.searchParams.get('admin_path')||'';
    if(suffix && !/^[a-z][a-z/]{0,70}$/.test(suffix))
      return new Response('Not found',{status:404});
    url.searchParams.delete('admin_path');
    return handleRequest(new Request(url,request),{
      path:'/admin'+(suffix?'/'+suffix:''),
      waitUntil
    });
  }
};
