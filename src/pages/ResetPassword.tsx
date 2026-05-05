import React from 'react';
import { Link } from 'react-router-dom';

export default function ResetPassword() {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="sticky top-0 w-full z-50 bg-white/70 backdrop-blur-md flex items-center px-4 h-16 border-b border-outline-variant/10">
        <div className="flex items-center gap-4">
          <Link to="/login" className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-slate-100 transition-colors active:scale-95 transition-transform">
            <span className="material-symbols-outlined text-primary">arrow_back</span>
          </Link>
          <h1 className="font-headline font-bold text-lg text-primary">重置密码</h1>
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white p-8 md:p-12 shadow-[0_24px_40px_rgba(25,28,29,0.04)] border-outline-variant/15 border rounded-xl">
          <div className="mb-10">
            <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>lock_reset</span>
            </div>
            <h2 className="font-headline font-extrabold text-3xl text-primary tracking-tight mb-3">重置密码</h2>
            <p className="text-on-surface-variant font-body leading-relaxed">请输入您的注册邮箱或手机号，我们将向您发送重置密码的指令。</p>
          </div>

          <form className="space-y-8">
            <div className="group">
              <label className="font-sans text-sm font-medium text-on-surface-variant mb-2 block" htmlFor="identifier">邮箱</label>
              <div className="relative flex items-center bg-surface-container-highest/30 border-b-2 border-outline-variant transition-all duration-300 focus-within:border-primary">
                <span className="material-symbols-outlined absolute left-3 text-on-surface-variant">alternate_email</span>
                <input 
                  className="w-full pl-11 pr-4 py-4 bg-transparent border-none focus:ring-0 text-on-surface font-sans placeholder:text-outline" 
                  id="identifier" 
                  placeholder="example@company.com" 
                  type="text" 
                />
              </div>
            </div>

            <div className="space-y-4">
              <button className="w-full bg-primary text-white py-4 rounded-md font-headline font-bold text-lg hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2" type="submit">
                <span>发送重置链接</span>
                <span className="material-symbols-outlined text-xl">send</span>
              </button>
              <button className="w-full flex items-center justify-center gap-2 py-3 text-on-surface-variant font-medium hover:bg-surface-container-high transition-colors rounded-md active:scale-[0.98]" type="button">
                <span className="material-symbols-outlined text-xl">contact_support</span>
                <span className="font-sans">联系客服寻求帮助</span>
              </button>
            </div>
          </form>
        </div>
      </main>

      <nav className="fixed bottom-0 w-full z-50 bg-white border-t border-slate-100 flex justify-around items-center h-16 px-4 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <Link className="flex flex-col items-center justify-center text-slate-400 hover:text-primary transition-colors" to="/login">
          <span className="material-symbols-outlined">login</span>
          <span className="font-sans text-[10px] font-medium mt-1">返回登录</span>
        </Link>
        <Link className="flex flex-col items-center justify-center text-slate-400 hover:text-primary transition-colors" to="#">
          <span className="material-symbols-outlined">contact_support</span>
          <span className="font-sans text-[10px] font-medium mt-1">联系支持</span>
        </Link>
      </nav>
    </div>
  );
}
