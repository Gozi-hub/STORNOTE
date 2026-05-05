import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { cn } from '@/src/lib/utils';
import { Mail, Lock, Eye, EyeOff, ArrowRight, LayoutGrid, AlertCircle } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedEmail = localStorage.getItem('stornote_remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  const [resendingEmail, setResendingEmail] = useState(false);

  const resendConfirmation = async () => {
    if (!email) return;
    setResendingEmail(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });
      if (resendError) throw resendError;
      setError('确认邮件已重发，请检查您的收件箱（包括垃圾邮件）。');
    } catch (err: any) {
      setError(`重发失败: ${err.message || '请稍后再试'}`);
    } finally {
      setResendingEmail(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    toast.loading('安全身份验证中...', { id: 'login-loading' });

    // Absolute safety sentinel - forces state recovery after 12 seconds
    const sentinelId = setTimeout(() => {
      setLoading(false);
      const timeoutMsg = '验证连接超时，请刷新页面重新登录。';
      setError(timeoutMsg);
      toast.error(timeoutMsg, { id: 'login-loading' });
    }, 12000);

    try {
      console.log('[Login] Request initiating...');
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log('[Login] Network response received');
      clearTimeout(sentinelId);

      if (signInError) throw signInError;
      if (!data.user) throw new Error('授权响应异常，请重试');
      
      toast.success('验证通过，正在同步资料...', { id: 'login-loading' });

      // Save email for convenience if rememberMe is checked
      if (rememberMe) {
        localStorage.setItem('stornote_remembered_email', email);
      } else {
        localStorage.removeItem('stornote_remembered_email');
      }

      // Check user status in Supabase profiles table
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
      
      if (profileError || !profile) {
        const msg = '账户信息不存在，请联系管理员';
        setError(msg);
        toast.error(msg, { id: 'login-loading' });
        await supabase.auth.signOut();
        return;
      }
      
      if (profile.role === 'admin') {
        toast.dismiss('login-loading');
        navigate('/admin/approval');
        return;
      }

      if (profile.status === 'pending') {
        const msg = '您的账户申请正在审核中，请耐心等待邮件通知';
        setError(msg);
        toast.error(msg, { id: 'login-loading' });
        await supabase.auth.signOut();
        return;
      }

      if (profile.status === 'rejected') {
        const msg = `您的申请已被拒绝。原因：${profile.rejection_reason || '未说明'}`;
        setError(msg);
        toast.error(msg, { id: 'login-loading' });
        await supabase.auth.signOut();
        return;
      }

      // Approved user
      toast.dismiss('login-loading');
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Login error details:', err);
      let errorMessage = '登录失败，请检查您的网络连接或稍后重试';
      
      try {
        // ... (error parsing logic)
        // ...
        // (existing error parsing logic)
        let msg = '';
        if (typeof err.message === 'string') {
          msg = err.message;
        } else if (err.message) {
          msg = JSON.stringify(err.message);
        } else {
          msg = typeof err === 'string' ? err : JSON.stringify(err);
        }

        const finalMsg = msg || '';
        if (finalMsg.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(finalMsg);
            msg = parsed.message || parsed.error || finalMsg;
          } catch (e) {}
        }

        if (msg.includes('Invalid login credentials')) {
          errorMessage = '邮箱或密码错误，请重新输入';
        } else if (msg.includes('Email not confirmed')) {
          errorMessage = '您的邮箱尚未激活。请检查邮件或重新注册。';
        } else if (msg.includes('Invalid API key')) {
          errorMessage = 'Supabase API Key 无效，请检查设置';
        } else if (msg.includes('Failed to fetch')) {
          errorMessage = '网络连接失败，请确认网络环境';
        } else {
          errorMessage = `登录错误: ${msg}`;
        }
      } catch (e) {
        errorMessage = '登录过程中发生未知异常';
      }
      
      setError(errorMessage);
      toast.error(errorMessage, { id: 'login-loading' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface pattern-bg p-6 bg-[radial-gradient(#c0c8cc_0.5px,transparent_0.5px)] bg-[size:24px_24px]">
      <main className="w-full max-w-md">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-4">
            <div className="w-12 h-12 bg-primary-container rounded-lg flex items-center justify-center mb-1 shadow-sm">
              <LayoutGrid className="text-white w-7 h-7" />
            </div>
          <h1 className="font-headline font-black text-primary text-xl uppercase tracking-wider">Stornote</h1>
          <p className="text-on-surface-variant font-medium text-xs mt-0.5">仓小记</p>
        </div>

        {/* Login Card */}
        <div className="bg-white p-5 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-outline-variant/10">
          <div className="mb-4">
            <h2 className="font-headline font-bold text-lg text-on-surface tracking-tight">商家登录</h2>
            <p className="text-on-surface-variant text-xs mt-0.5">访问您的库存和运营数据</p>
          </div>

          <form className="space-y-3" onSubmit={handleLogin}>
            {/* Username/Email Input */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant ml-1" htmlFor="username">邮箱地址</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="text-outline w-5 h-5" />
                </div>
                <input 
                  className="block w-full pl-10 pr-4 py-3 bg-surface-container-low border-b-2 border-transparent focus:border-primary focus:ring-0 transition-all outline-none text-on-surface font-medium" 
                  id="username" 
                  name="username" 
                  placeholder="请输入您的邮箱" 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant" htmlFor="password">密码</label>
                <Link className="text-xs font-bold text-primary hover:underline transition-colors" to="/reset-password">忘记密码？</Link>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="text-outline w-5 h-5" />
                </div>
                <input 
                  className="block w-full pl-10 pr-12 py-3 bg-surface-container-low border-b-2 border-transparent focus:border-primary focus:ring-0 transition-all outline-none text-on-surface font-medium" 
                  id="password" 
                  name="password" 
                  placeholder="••••••••" 
                  type={showPassword ? "text" : "password"} 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-outline hover:text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center space-x-3 px-1">
              <div className="flex items-center h-5">
                <input 
                  className="w-4 h-4 text-primary border-outline-variant rounded focus:ring-primary/20 bg-surface-container-low transition-colors cursor-pointer" 
                  id="remember" 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
              </div>
              <label className="text-sm font-medium text-on-surface-variant select-none cursor-pointer" htmlFor="remember">保持登录状态</label>
            </div>

            {/* Login Button */}
            <div className="space-y-3">
              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white py-2.5 rounded shadow-lg hover:shadow-primary/20 hover:bg-primary-container transition-all flex items-center justify-center space-x-2 active:scale-[0.98] duration-200 disabled:opacity-50"
              >
                <span className="font-headline font-bold uppercase tracking-widest text-xs">{loading ? '登录中...' : '登录'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Bottom Action */}
          <div className="mt-4 pt-4 border-t border-outline-variant/20 text-center">
            <p className="text-xs text-on-surface-variant">
              新商家合作伙伴？ 
              <Link className="font-bold text-primary hover:underline ml-1" to="/register">申请账户</Link>
            </p>
          </div>
        </div>

        {/* Footer Info */}
        <footer className="mt-6 text-center">
          <div className="flex justify-center space-x-6 text-xs font-bold uppercase tracking-tighter text-on-surface-variant/60 mb-2">
            <a className="hover:text-primary transition-colors" href="#">隐私政策</a>
            <a className="hover:text-primary transition-colors" href="#">服务条款</a>
            <a className="hover:text-primary transition-colors" href="#">安全</a>
          </div>
          <p className="text-[10px] text-outline-variant uppercase tracking-widest">
            系统安全版本 4.2.0 • © 2024 Precision Analytics
          </p>
        </footer>
      </main>

      {/* Side Decoration (Hidden on mobile) */}
      <div className="hidden lg:block fixed right-12 bottom-12 w-32 h-32 opacity-10">
        <div className="grid grid-cols-4 gap-2">
          {[...Array(16)].map((_, i) => (
            <div key={i} className={cn("w-full aspect-square", [3, 5, 10].includes(i) ? "bg-transparent" : "bg-primary")}></div>
          ))}
        </div>
      </div>
    </div>
  );
}
