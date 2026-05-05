import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '@/src/lib/utils';
import toast from 'react-hot-toast';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
}

export default function Layout({ children, title = '仓储管理系统', showBack = false }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { user, logout } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { icon: 'dashboard', label: '控制面板', path: '/dashboard' },
    { icon: 'inventory_2', label: '库存查询', path: '/inventory' },
    { icon: 'account_balance_wallet', label: '记账', path: '/transactions' },
    { icon: 'analytics', label: '报表', path: '/reports' },
  ];

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsProfileOpen(false);
    const toastId = toast.loading('正在退出...', { duration: 2000 });
    try {
      await logout();
      toast.success('已退出登录', { id: toastId });
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      // Even if signOut fails, we should force back to login
      navigate('/login');
    }
  };

  const getUserInitial = () => {
    if (!user) return '?';
    const email = user.email || '';
    return email.charAt(0).toUpperCase() || 'U';
  };

  const userDisplayName = (user?.user_metadata?.full_name || user?.user_metadata?.display_name || '商家用户');
  const userPhotoURL = user?.user_metadata?.avatar_url;

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* TopAppBar */}
      <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-outline-variant/10 flex justify-between items-center px-6 h-16">
        <div className="flex items-center gap-3">
          {showBack ? (
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-surface-container rounded-full transition-colors">
              <span className="material-symbols-outlined text-primary-container">arrow_back</span>
            </button>
          ) : (
            <span className="material-symbols-outlined text-primary-container text-2xl">factory</span>
          )}
          <h1 className="font-headline font-extrabold text-lg text-primary-container tracking-tight">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {/* Profile Menu */}
          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className={cn(
                "w-9 h-9 rounded-full overflow-hidden ring-2 border border-white transition-all flex items-center justify-center",
                isProfileOpen ? "ring-primary scale-95" : "ring-surface-container hover:ring-primary",
                !userPhotoURL && "bg-primary text-white font-bold text-sm"
              )}
            >
              {userPhotoURL ? (
                <img 
                  className="w-full h-full object-cover" 
                  src={userPhotoURL} 
                  alt="Profile"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span>{getUserInitial()}</span>
              )}
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-outline-variant/10 py-2 z-[60] animate-in fade-in zoom-in duration-200">
                <div className="px-4 py-2 border-b border-outline-variant/5 mb-1">
                  <p className="text-xs font-bold text-primary uppercase tracking-widest">
                    {userDisplayName}
                  </p>
                  <p className="text-[10px] text-on-surface-variant truncate">
                    {user?.email || '未登录'}
                  </p>
                </div>
                <button 
                  onClick={() => { setIsProfileOpen(false); navigate('/login'); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-on-surface hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">switch_account</span>
                  <span>切换账号</span>
                </button>
                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-error hover:bg-error/5 transition-colors"
                >
                  <span className="material-symbols-outlined text-lg">logout</span>
                  <span>退出登录</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Side Navigation (Desktop) */}
      <aside className="hidden md:flex fixed left-0 top-16 bottom-0 w-20 bg-white border-r border-outline-variant/10 z-40 flex-col items-center py-8 gap-10">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "p-3 rounded-2xl transition-all",
              location.pathname.startsWith(item.path)
                ? "text-primary-container bg-primary-container/10 shadow-sm"
                : "text-on-surface-variant/60 hover:text-primary-container hover:bg-surface-container"
            )}
            title={item.label}
          >
            <span 
              className="material-symbols-outlined text-2xl"
              style={{ fontVariationSettings: location.pathname.startsWith(item.path) ? "'FILL' 1" : "'FILL' 0" }}
            >
              {item.icon}
            </span>
          </Link>
        ))}
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex-grow pt-18 pb-20 px-2 md:px-4 max-w-6xl mx-auto w-full",
        "md:pl-24" // Offset for sidebar
      )}>
        {children}
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="fixed bottom-0 left-0 w-full flex justify-around items-center px-4 py-1.5 pb-safe bg-white border-t border-slate-200/50 shadow-xl z-50 md:hidden">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex flex-col items-center justify-center px-5 py-1 active:scale-95 transition-transform duration-150",
              location.pathname.startsWith(item.path)
                ? "bg-primary-container/10 text-primary-container rounded-xl"
                : "text-slate-500"
            )}
          >
            <span 
              className="material-symbols-outlined mb-1 text-[22px]"
              style={{ fontVariationSettings: location.pathname.startsWith(item.path) ? "'FILL' 1" : "'FILL' 0" }}
            >
              {item.icon}
            </span>
            <span className="font-sans text-[11px] font-semibold uppercase tracking-wider">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
