import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { Mail, Lock, Key, Eye, EyeOff, ShieldCheck, ArrowLeft, Send } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export default function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    code: '',
    password: '',
    agreed: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null); // For developer testing

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSendCode = async () => {
    if (!formData.email) {
      toast.error('请输入邮箱地址');
      return;
    }
    if (!formData.password || formData.password.length < 6) {
      toast.error('请先设置至少 6 位数的密码，再获取验证码');
      return;
    }
    setSendingCode(true);
    setError(null);
    setDevCode(null);

    // Hard timeout helper
    const timeout = (ms: number) => new Promise((_, reject) => 
      setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), ms)
    );

    try {
      const emailLower = formData.email.toLowerCase().trim();
      
      // NEW: Pre-check if user already exists in profiles table
      // This provides better UX than waiting for Supabase's silent identity protection
      setSendingCode(true);
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', emailLower)
        .maybeSingle();

      if (existingProfile) {
        setSendingCode(false);
        const msg = '⚠️ 该邮箱已注册，请直接前往登录界面。';
        toast.error(msg, { id: 'auth-conflict', duration: 4000 });
        setError(msg);
        return;
      }

      console.log('[Auth] Step 1: Triggering Supabase Native Auth...');
      
      // Step 1: Create the user in Supabase Auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: emailLower,
        password: formData.password,
        options: {
          emailRedirectTo: window.location.origin,
        }
      });

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          const msg = '该邮箱已注册，请直接前往登录界面。';
          toast.error(msg);
          setError(msg);
          return;
        }
        throw signUpError;
      }

      console.log('[Auth] Step 2: Supabase processed signup.');
      setCountdown(60);
      toast.success('验证码/验证链接已发送至您的邮箱');
    } catch (err: any) {
      console.error('[Auth] Native auth failed:', err);
      let msg = err.message || '发送失败，请在 Supabase 控制台检查邮箱设置';
      
      // Specifically catch rate limit errors common in Supabase free tier
      if (err.status === 429 || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('too many requests')) {
        msg = '发送频率过快。Supabase 免费版每小时仅支持发送 3 封验证邮件。请检查垃圾邮件箱，或 1 小时后再试。';
      }
      
      toast.error(msg);
      setError(msg);
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.agreed) {
      toast.error('请先同意服务协议与隐私政策');
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      const emailLower = formData.email.toLowerCase().trim();
      
      // NEW: Pre-check in handleSubmit as well to prevent malformed verifyOtp calls
      // that trigger HTML 403 leaks from the gateway.
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', emailLower)
        .maybeSingle();

      if (existingProfile) {
        setLoading(false);
        const msg = '⚠️ 该邮箱已注册，请直接前往登录界面。';
        toast.error(msg);
        setError(msg);
        return;
      }

      const codeClean = formData.code.trim();
      if (codeClean.length !== 6 || !/^\d+$/.test(codeClean)) {
        setLoading(false);
        toast.error('请输入 6 位完整的数字验证码');
        return;
      }
      
      console.log('[Auth] handleSubmit: Starting verification for', emailLower);

      // Add a safety timeout for the verifyOtp call
      const verifyPromise = supabase.auth.verifyOtp({
        email: emailLower,
        token: formData.code,
        type: 'signup'
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('验证请求超时，请检查网络后重试。如果多次超时，请确认 Supabase 配置是否正确。')), 30000)
      );

      const { data, error: verifyError } = await Promise.race([verifyPromise, timeoutPromise]) as any;

      if (verifyError) {
        console.error('[Auth] verifyOtp technical error:', verifyError);
        
        // Check for common mismatch between signup and verifyOtp
        if (String(verifyError).includes('Email not found') || String(verifyError).includes('otp_not_found')) {
           throw new Error('未找到该邮箱的验证请求，请先点击“获取验证码”。');
        }
        
        // Special check for HTML responses that might have slipped through libraries
        if (String(verifyError).includes('Unexpected token <')) {
           console.error('[Crit] HTML Response detected during verifyOtp. Verify the server proxy logs.');
        }
        throw verifyError;
      }
      
      console.log('[Auth] verifyOtp successful. User data:', data?.user?.id);

      if (!data.user) throw new Error('验证成功但未获取到用户信息');
      
      toast.success('验证成功，正在创建账户...');

      // Step 4: Create User Profile in database
      console.log('[Auth] Step 4: Creating profile in database...');
      const isAdminEmail = emailLower === 'bdjdnjdhdbd4@gmail.com';
      
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          email: emailLower,
          role: isAdminEmail ? 'admin' : 'user',
          status: 'approved',
          created_at: new Date().toISOString()
        });

      if (profileError) {
        console.error('[Auth] Profile creation failed (database write error):', profileError);
        // Don't throw here, the auth part was successful
        toast.error('账户资料同步失败，请联系管理员。');
      } else {
        console.log('[Auth] Profile created successfully.');
      }

      toast.success('注册成功！正在进入控制面板...');
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err: any) {
      console.error('[Auth] Registration Flow Fatal Error:', err);
      
      let msg = '验证失败，请确认验证码是否正确或已过期';
      const rawErrorStr = String(err).toLowerCase();
      const errDetail = err.message || '';
      
      // Specifically handle JSON parse errors from HTML responses
      if (errDetail.includes('Received HTML') || err.name === 'SyntaxError' || errDetail.includes('Unexpected token') || rawErrorStr.includes('unexpected token')) {
        console.error('[Crit] Registration gateway returned HTML/Invalid data. Details:', errDetail);
        msg = '⚠️ 注册系统网关异常：认证服务暂时无法解析请求（返回了网关错误）。这通常是由于网络延迟或网关冲突导致的。建议您点击“立即注册”重试，或刷新页面后再次尝试。';
      } else if (errDetail.includes('TIMEOUT')) {
        msg = '验证请求超时，请刷新页面并检查您的网络连接。';
      } else if (rawErrorStr.includes('<html>')) {
        msg = '⚠️ 系统网关暂时无法处理该请求（返回了网页内容）。请刷新页面重试。';
      } else if (errDetail.includes('token') || errDetail.includes('code') || errDetail.includes('invalid')) {
        msg = '验证码错误或已过期，请检查邮件后重新输入';
      } else if (errDetail) {
        msg = errDetail;
      }
      
      toast.error(msg, { duration: 6000 });
      setError(msg);
    } finally {
      console.log('[Auth] handleSubmit: Flow finished.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 bg-[radial-gradient(#c0c8cc_0.5px,transparent_0.5px)] bg-[size:24px_24px]">
      <main className="w-full max-w-md">
        <div className="flex flex-col items-center mb-4">
          <Link to="/login" className="self-start mb-2 p-1.5 hover:bg-white rounded-full transition-all text-on-surface-variant flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
            <ArrowLeft className="w-3.5 h-3.5" /> 返回登录
          </Link>
          <div className="w-12 h-12 bg-primary-container rounded-lg flex items-center justify-center mb-1 shadow-sm">
            <ShieldCheck className="text-white w-7 h-7" />
          </div>
          <h1 className="font-headline font-black text-primary text-xl uppercase tracking-wider">申请账户</h1>
          <p className="text-on-surface-variant font-medium text-xs mt-0.5">仅需邮箱验证，开启您的仓储之旅</p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-outline-variant/10">
          <form className="space-y-3" onSubmit={handleSubmit}>
            {/* Email */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">邮箱地址</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="text-outline w-4 h-4" />
                </div>
                <input 
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="block w-full pl-9 pr-4 py-2.5 bg-surface-container-low border-b-2 border-transparent focus:border-primary focus:ring-0 transition-all outline-none text-on-surface font-medium text-sm" 
                  placeholder="example@company.com" 
                  type="email" 
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">设置密码</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="text-outline w-4 h-4" />
                </div>
                <input 
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  minLength={6}
                  className="block w-full pl-9 pr-12 py-2.5 bg-surface-container-low border-b-2 border-transparent focus:border-primary focus:ring-0 transition-all outline-none text-on-surface font-medium text-sm" 
                  placeholder="••••••••" 
                  type={showPassword ? "text" : "password"} 
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-outline hover:text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Verification Code */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">验证码</label>
              <div className="flex gap-2">
                <div className="relative flex-grow">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key className="text-outline w-4 h-4" />
                  </div>
                  <input 
                    name="code"
                    value={formData.code}
                    onChange={handleChange}
                    required
                    className="block w-full pl-9 pr-2 py-2.5 bg-surface-container-low border-b-2 border-transparent focus:border-primary focus:ring-0 transition-all outline-none text-on-surface font-mono font-medium tracking-[0.2em] text-sm" 
                    placeholder="000000" 
                    type="text" 
                    maxLength={6}
                  />
                </div>
                <button 
                  type="button"
                  disabled={sendingCode || countdown > 0}
                  onClick={handleSendCode}
                  className="px-3 py-2 bg-surface-container text-primary text-[10px] font-bold rounded hover:bg-primary-container hover:text-white transition-all disabled:opacity-50 min-w-[80px]"
                >
                  {countdown > 0 ? `${countdown}s` : sendingCode ? '发送中...' : '获取验证码'}
                </button>
              </div>
            </div>

            {/* Agreement */}
            <div className="flex items-center space-x-2 px-1">
              <input 
                name="agreed"
                checked={formData.agreed}
                onChange={handleChange}
                className="w-3.5 h-3.5 text-primary border-outline-variant rounded focus:ring-primary/20 bg-surface-container-low transition-colors cursor-pointer" 
                type="checkbox" 
                id="agreed"
              />
              <label htmlFor="agreed" className="text-[10px] text-on-surface-variant select-none cursor-pointer">
                我已阅读并在同意 <span className="text-primary font-bold hover:underline">服务协议与隐私政策</span>
              </label>
            </div>

            {/* Submit Button */}
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-2.5 rounded shadow-lg hover:shadow-primary/20 hover:bg-primary-container transition-all flex items-center justify-center space-x-2 active:scale-[0.98] duration-200 disabled:opacity-50"
            >
              <span className="font-headline font-bold uppercase tracking-widest text-xs">{loading ? '注册中...' : '立即注册'}</span>
              <Send className="w-4 h-4" />
            </button>
          </form>

          <footer className="mt-4 pt-4 border-t border-outline-variant/20 text-center">
            <p className="text-xs text-on-surface-variant">
              已有账户？<Link className="text-primary font-bold hover:underline ml-1" to="/login">点击登录</Link>
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
