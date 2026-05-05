import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { Resend } from "resend";
import dotenv from "dotenv";
import { createProxyMiddleware } from 'http-proxy-middleware';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY || process.env.VITE_RESEND_API_KEY);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Global request tracker - Debugging only
  app.use((req, res, next) => {
    const p = req.url;
    if (p.includes('/v1/') || p.includes('proxy')) {
      console.log(`[Trace] ${req.method} ${p} (Headers: ${req.get('accept') || 'none'})`);
    }
    next();
  });

  // Flexible detection: Check for both VITE_ prefixed and unprefixed versions
  const SUPABASE_URL_RAW = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
  const SUPABASE_MGMT_URL = "https://api.supabase.com";

  // Protocol validation and URL cleaning
  let SUPABASE_URL = SUPABASE_URL_RAW;
  if (SUPABASE_URL) {
    if (!SUPABASE_URL.startsWith('http')) {
      SUPABASE_URL = `https://${SUPABASE_URL}`;
    }
    SUPABASE_URL = SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  }

  console.log('[Backend] Startup Check:');
  console.log(` - SUPABASE_URL: ${SUPABASE_URL ? 'Present' : 'MISSING'}`);
  console.log(` - SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY ? 'Present' : 'MISSING'}`);

  // 0. Vital Credential Guard - Return JSON if config is missing
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    app.all(['/supabase-proxy*', '/auth/v1*', '/rest/v1*', '/storage/v1*', '/supabase-mgmt-proxy*'], (req, res) => {
      res.status(503).json({ 
        error: 'Supabase Configuration Missing', 
        message: '服务器未配置 Supabase 环境变量 (SUPABASE_URL 或 SUPABASE_ANON_KEY)',
        status: 'error'
      });
    });
  }

  let supabaseProxy: any = null;

  // 1. Supabase API Proxy - MUST BE MOUNTED BEFORE ANY BODY-PARSING MIDDLEWARE
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const targetBase = new URL(SUPABASE_URL);
    
    supabaseProxy = createProxyMiddleware({
      target: SUPABASE_URL,
      changeOrigin: true,
      secure: false,
      ws: true,
      // We don't use pathRewrite globally here because we handle it in the mount logic
      proxyTimeout: 30000,
      on: {
        proxyReq: (proxyReq, req, res) => {
          proxyReq.setHeader('apikey', SUPABASE_ANON_KEY);
          
          const authHeader = req.headers['authorization'];
          if (!authHeader || (authHeader as string).includes('placeholder-key')) {
            proxyReq.setHeader('authorization', `Bearer ${SUPABASE_ANON_KEY}`);
          }
          
          proxyReq.setHeader('host', targetBase.host);
          
          // Force origin and referer to match target to satisfy some WAFs/CORS
          proxyReq.setHeader('Origin', targetBase.origin);
          proxyReq.setHeader('Referer', `${targetBase.origin}/`);
          
          // Hard-enforce JSON acceptance to prevent HTML redirects on 4xx/5xx
          if (req.headers['accept'] && !req.headers['accept'].includes('application/json')) {
            proxyReq.setHeader('Accept', 'application/json, text/plain, */*');
          } else if (!req.headers['accept']) {
            proxyReq.setHeader('Accept', 'application/json');
          }
          
          // Debugging path
          const urlStr = req.url || '';
          if (urlStr.includes('/auth/') || urlStr.includes('/rest/')) {
            console.log(`[Proxy Link] ${req.method} ${urlStr} -> ${targetBase.host}`);
          }
        },
        proxyRes: (proxyRes, req, res) => {
          const status = proxyRes.statusCode;
          const contentType = proxyRes.headers['content-type'];
          if (status && status >= 400) {
            console.warn(`[Proxy Res Error] ${req.method} ${req.url} -> Status ${status} (${contentType})`);
          } else if (req.url && (req.url.includes('/auth/') || req.url.includes('/rest/'))) {
            // Success logging
            console.log(`[Proxy Res Success] ${req.method} ${req.url} -> Status ${status}`);
          }
        },
        error: (err, req, res) => {
          console.error('[Proxy Error]:', err.message);
          const response = res as any;
          if (!response.headersSent) {
            response.status(502).json({ 
              error: 'Gateway Sync Error', 
              message: '身份验证网关同步失败，请刷新页面重试',
              details: err.message 
            });
          }
        }
      }
    });

    // Mount high-authority proxy that intercepts all relevant paths
    // We use a middleware that doesn't consume the path prefix itself to keep req.url intact
    app.use((req, res, next) => {
      const p = req.url;
      // If it starts with /supabase-proxy, we need to strip it before passing to proxy
      if (p.startsWith('/supabase-proxy')) {
        req.url = p.replace('/supabase-proxy', '');
        if (req.url === '') req.url = '/';
        return supabaseProxy(req, res, next);
      }
      
      // If it's a management proxy request
      if (p.startsWith('/supabase-mgmt-proxy')) {
        req.url = p.replace('/supabase-mgmt-proxy', '');
        if (req.url === '') req.url = '/';
        return createProxyMiddleware({
          target: SUPABASE_MGMT_URL,
          changeOrigin: true,
          secure: false,
          on: {
            proxyReq: (proxyReq) => {
              proxyReq.setHeader('host', 'api.supabase.com');
              proxyReq.setHeader('Origin', 'https://api.supabase.com');
            }
          }
        })(req, res, next);
      }
      
      // If it's a direct Supabase path, pass it through AS IS
      if (p.startsWith('/auth/') || p.startsWith('/rest/') || p.startsWith('/storage/')) {
        return supabaseProxy(req, res, next);
      }
      
      next();
    });
  }

  // 0.2 Ultimate API Safety Barrier - Block HTML fallback for ALL api-like paths
  app.use(['/auth/*', '/rest/*', '/storage/*', '/api/*', '/supabase-proxy*'], (req, res, next) => {
    const response = res as any;
    if (!response.headersSent) {
      console.warn(`[Guard] API Route missed/leaked to safety barrier: ${req.method} ${req.originalUrl}`);
      return response.status(404).json({ 
        error: 'AUTH_GATEWAY_NOT_READY', 
        message: '认证网关未就绪或路径匹配失败，请按 F5 刷新页面重试',
        path: req.originalUrl
      });
    }
    next();
  });

  // 2. NOW we can mount body-parsing for local routes
  app.use(express.json());

  app.use((req, res, next) => {
    // Only log non-proxy requests to keep noise down
    if (!req.url.startsWith('/supabase-proxy')) {
      console.log(`[Request] ${req.method} ${req.url}`);
    }
    next();
  });

  // 1. Diagnostic API - Check if secrets are loaded correctly
  app.get("/api/diag", async (req, res) => {
    const allKeys = Object.keys(process.env);
    const supabaseKeys = allKeys.filter(k => k.toLowerCase().includes('supabase'));
    
    // Connectivity test
    let connectionTest = "Untested";
    if (SUPABASE_URL) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(SUPABASE_URL, { signal: controller.signal });
        clearTimeout(tid);
        connectionTest = `Reachability: ${resp.status} ${resp.statusText}`;
      } catch (e: any) {
        connectionTest = `Unreachable: ${e.message}`;
      }
    }
    
    res.json({
      status: "Online",
      connectivity: connectionTest,
      detectedEnvKeys: supabaseKeys,
      supabaseUrl: SUPABASE_URL ? `Present (${SUPABASE_URL})` : "Missing",
      supabaseKey: SUPABASE_ANON_KEY ? `Present (${SUPABASE_ANON_KEY.substring(0, 15)}...)` : "Missing",
      keyLength: SUPABASE_ANON_KEY?.length || 0,
      keyFormatValid: SUPABASE_ANON_KEY?.startsWith('eyJ'),
      suggestion: SUPABASE_ANON_KEY?.startsWith('sb_') ? "Your key prefix 'sb_' is for Stripe, not Supabase. Use the 'anon public' key starting with 'eyJ'." : "Verify your keys in Settings > Secrets",
      nodeEnv: process.env.NODE_ENV,
      serverTime: new Date().toISOString()
    });
  });

  // 2. Auth Routes
  app.post("/api/auth/request-otp", async (req, res) => {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are required" });
    }

    console.log(`[Backend] Processing OTP request for ${email}`);

    // Step 1: Write to Supabase (Server-side)
    try {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const supabaseResp = await fetch(`${SUPABASE_URL}/rest/v1/otps`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY as string,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          code,
          expires_at: expiresAt
        })
      });

      if (!supabaseResp.ok) {
        const errorData = await supabaseResp.json();
        console.error('[Backend] Supabase Write Error:', errorData);
        return res.status(supabaseResp.status).json({ 
          error: "Failed to store OTP in database", 
          details: errorData.message || "Table 'otps' might be missing. Please run SQL migration."
        });
      }
      console.log('[Backend] OTP stored in Supabase.');
    } catch (err: any) {
      console.error('[Backend] Supabase Connection Error:', err.message);
      return res.status(500).json({ error: "Could not connect to database" });
    }

    // Step 2: Send Email via Resend
    if (!process.env.RESEND_API_KEY && !process.env.VITE_RESEND_API_KEY) {
      // If no mail server, we still succeeded in writing to DB (useful for debugging)
      return res.status(200).json({ 
        success: true, 
        message: "OTP stored (Mail server not configured)",
        devCode: code 
      });
    }

    try {
      const { error: mailError } = await resend.emails.send({
        from: "Stornote <onboarding@resend.dev>",
        to: [email],
        subject: "您的仓小记验证码",
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #0f172a; font-weight: 800; text-transform: uppercase;">Stornote 仓小记</h2>
            <p style="color: #64748b;">您正在申请注册仓小记账户，请使用以下验证码完成验证：</p>
            <div style="background-color: #f1f5f9; padding: 20px; text-align: center; border-radius: 8px;">
              <span style="font-size: 32px; font-weight: 900; color: #0284c7;">${code}</span>
            </div>
          </div>
        `,
      });

      if (mailError) {
        console.error('[Backend] Resend Error:', mailError);
        // If writing to DB succeeded but mail failed, we can provide a dev fallback
        return res.status(200).json({ 
          success: true, 
          isDevFallback: true,
          devCode: code,
          error: "Email delivery failed: " + (mailError.message || JSON.stringify(mailError))
        });
      }

      res.status(200).json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Email service internal error: " + err.message });
    }
  });

  // 3. Keep diagnostic for health checks

  // 4. Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // CRITICAL: Handle WebSocket upgrades for the proxy
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
     server.on('upgrade', (req, socket, head) => {
       const p = req.url || '';
       if (p.includes('realtime') || p.includes('supabase-proxy')) {
         console.log(`[Proxy] Upgrading WebSocket for: ${p}`);
         
         // Fix req.url before passing to proxy
         if (p.startsWith('/supabase-proxy')) {
           req.url = p.replace('/supabase-proxy', '');
         }
         
         if (supabaseProxy) {
           supabaseProxy.upgrade(req, socket, head);
         }
       }
     });
  }
}

startServer();
