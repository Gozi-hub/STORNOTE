import { createClient } from '@supabase/supabase-js';

const supabaseUrlRaw = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || "").trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY || "").trim();

// Sanitize URL: Remove /rest/v1 if accidentally included
const supabaseUrl = supabaseUrlRaw.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');

// Use a proxy URL if we're in the browser to bypass local network restrictions
// BUT check if we are in our specific dev environment first.
// If it's a standard deployment (like Netlify), we should use direct URL if possible.
const isBrowser = typeof window !== 'undefined';
const isDevApplet = isBrowser && window.location.hostname.includes('europe-west2.run.app');

let effectiveUrl = (supabaseUrl || 'https://placeholder-url.supabase.co');

if (isBrowser && isDevApplet) {
  // Use current origin to build an absolute URL for the SDK
  // We trim trailing slashes to avoid double-slashes in paths
  const origin = window.location.origin.replace(/\/+$/, '');
  effectiveUrl = `${origin}/supabase-proxy`;
}

let supabaseClient;
try {
  supabaseClient = createClient(
    effectiveUrl,
    supabaseAnonKey || 'placeholder-key',
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      global: {
        fetch: async (input, init) => {
          let url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as any).url;

          if (isBrowser && isDevApplet && url) {
            let newUrl = url;
            // 1. Convert absolute supabase.co URLs to absolute proxy URLs
            if (url.includes('.supabase.co')) {
               const parts = url.split('.supabase.co');
               if (parts.length > 1) {
                 newUrl = `${window.location.origin}/supabase-proxy${parts[1]}`;
               }
            } 
            // 1.1 Support for api.supabase.com calls
            else if (url.includes('api.supabase.com')) {
               const parts = url.split('api.supabase.com');
               if (parts.length > 1) {
                 newUrl = `${window.location.origin}/supabase-mgmt-proxy${parts[1]}`;
               }
            }
            // 2. Fix relative paths that might be absolute-relative (starting with slash)
            else if (url.startsWith('/auth/v1') || url.startsWith('/rest/v1') || url.startsWith('/storage/v1')) {
               newUrl = `${window.location.origin}/supabase-proxy${url}`;
            }
            // 3. Ensure proxy URLs are absolute and consistent
            else if (url.includes('/supabase-proxy') && !url.startsWith('http')) {
               newUrl = `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
            }
            // 4. Final safety: If it's a relative path but doesn't have the proxy, prepend it
            else if (!url.startsWith('http') && (url.includes('auth/v1') || url.includes('rest/v1'))) {
               const cleanPath = url.startsWith('/') ? url : `/${url}`;
               newUrl = `${window.location.origin}/supabase-proxy${cleanPath}`;
            }

            // Always use absolute URLs for the browser fetch to prevent resolution issues
            if (newUrl !== url) {
               console.log(`[Supabase Proxy] Routing: ${url} -> ${newUrl}`);
            }
               
            let finalInput: string | Request = newUrl;
            
            // If the input was a Request object, we need to be careful about headers/body
            if (typeof input !== 'string' && !(input instanceof URL)) {
               try {
                 // Try to preserve as much as possible from the original request
                 finalInput = new Request(newUrl, input as Request);
               } catch (reqErr) {
                 console.warn('[Supabase Proxy] Could not clone Request, falling back to URL string:', reqErr);
                 finalInput = newUrl;
               }
            }

            // Retry logic for transient network failures
            let attempts = 0;
            const maxAttempts = 2;
            
            async function performFetch(): Promise<Response> {
              try {
                const resp = await fetch(finalInput, init);
                
                // GUARD: Catch HTML leaks before they crash the SDK's JSON parser
                const contentType = resp.headers.get('content-type');
                if (!resp.ok && contentType && contentType.includes('text/html')) {
                  const status = resp.status;
                  const text = await resp.clone().text().catch(() => '');
                  console.error('[Supabase Proxy] HTML Leak Error on Status:', status, {
                    url: newUrl,
                    contentType
                  });
                  
                  const snippet = text.substring(0, 150).replace(/<[^>]*>/g, ' ').trim();
                  
                  if (text.includes('AUTH_GATEWAY_NOT_READY')) {
                    throw new Error(`认证网关未就绪: ${status}. 服务正在启动或配置有误。`);
                  }
                  throw new Error(`认证服务返回了非预期数据 (HTML 错误页): ${status}. 错误摘要: ${snippet || '无内容'}.`);
                }
                
                return resp;
              } catch (fetchErr: any) {
                if (attempts < maxAttempts && fetchErr.name === 'TypeError' && fetchErr.message === 'Failed to fetch') {
                  attempts++;
                  console.warn(`[Supabase Proxy] Retry attempt ${attempts} for URL: ${newUrl}`);
                  await new Promise(r => setTimeout(r, 1000 * attempts));
                  return performFetch();
                }
                
                console.error('[Supabase Proxy] Fetch Execution Error:', {
                  name: fetchErr.name,
                  message: fetchErr.message,
                  url: newUrl,
                  stack: fetchErr.stack
                });
                
                if (fetchErr.name === 'TypeError' && fetchErr.message === 'Failed to fetch') {
                  console.warn('[Supabase Proxy] Network error detected. This might be due to the server restarting or temporary connectivity issues.');
                }
                
                throw fetchErr;
              }
            }

            return performFetch();
          }
          
          return fetch(input, init);
        }
      }
    }
  );
  console.log('[Supabase] Client initialized with relative proxy mode.');
} catch (e) {
  console.error('CRITICAL: Supabase client initialization failed:', e);
  // Create a dummy client to prevent export errors
  supabaseClient = {
    from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }), getSession: () => Promise.resolve({ data: { session: null } }) }
  } as any;
}

export const supabase = supabaseClient;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your platform secrets.');
}

export interface SupabaseErrorInfo {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export function handleSupabaseError(error: any) {
  console.error('Supabase Error:', error);
  const errInfo: SupabaseErrorInfo = {
    message: error.message || String(error),
    code: error.code,
    details: error.details,
    hint: error.hint
  };
  throw new Error(JSON.stringify(errInfo));
}
