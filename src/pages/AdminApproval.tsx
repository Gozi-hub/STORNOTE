import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

interface PendingUser {
  id: string;
  email: string;
  display_name?: string;
  company_name?: string;
  business_category?: string;
  phone?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export default function AdminApproval() {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);

  const fetchPendingUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingUsers(data || []);
    } catch (err) {
      console.error('Error fetching pending users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingUsers();

    // Subscribe to changes in profiles
    const channel = supabase
      .channel('pending_profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchPendingUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          status: 'approved',
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('Error approving user:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!showRejectModal) return;
    const id = showRejectModal;
    setProcessingId(id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          status: 'rejected',
          rejection_reason: rejectionReason,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
      setShowRejectModal(null);
      setRejectionReason('');
    } catch (error) {
      console.error('Error rejecting user:', error);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-8 p-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <div className="w-2 h-10 bg-primary-container rounded-full"></div>
        <div>
          <h2 className="text-3xl font-headline font-black text-primary-container">账号注册审批</h2>
          <p className="text-sm text-on-surface-variant font-bold uppercase tracking-widest mt-1">Registration Approval Workflow</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-container"></div>
        </div>
      ) : pendingUsers.length === 0 ? (
        <div className="bg-white p-16 rounded-3xl border border-outline-variant/10 text-center space-y-4">
          <div className="w-20 h-20 bg-surface-container-low rounded-full flex items-center justify-center mx-auto text-on-surface-variant/30">
            <span className="material-symbols-outlined text-4xl">person_search</span>
          </div>
          <p className="text-on-surface-variant font-bold">暂无待审批的注册申请</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {pendingUsers.map((user) => (
            <div key={user.id} className="bg-white p-8 rounded-3xl border border-outline-variant/10 shadow-sm hover:shadow-md transition-all flex flex-col lg:flex-row justify-between gap-8">
              <div className="flex-grow space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary-container/10 flex items-center justify-center text-primary-container">
                    <span className="material-symbols-outlined text-3xl">corporate_fare</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-primary-container">{user.company_name}</h3>
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-tighter">{user.business_category}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">负责人</p>
                    <p className="text-sm font-bold text-primary-container">{user.display_name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">联系邮箱</p>
                    <p className="text-sm font-bold text-primary-container">{user.email}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">联系电话</p>
                    <p className="text-sm font-bold text-primary-container">{user.phone}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-row lg:flex-col justify-end gap-3 min-w-[160px]">
                <button 
                  disabled={!!processingId}
                  onClick={() => handleApprove(user.id)}
                  className="flex-grow lg:flex-grow-0 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
                >
                  {processingId === user.id ? '处理中...' : '批准入驻'}
                </button>
                <button 
                  disabled={!!processingId}
                  onClick={() => setShowRejectModal(user.id)}
                  className="flex-grow lg:flex-grow-0 px-6 py-3 bg-white border-2 border-error/20 text-error rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-error/5 transition-all active:scale-95 disabled:opacity-50"
                >
                  拒绝申请
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary-container/20 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl border border-outline-variant/10 space-y-6">
            <h3 className="text-xl font-black text-primary-container">拒绝申请原因</h3>
            <textarea 
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="请输入拒绝原因，该信息将通过邮件发送给申请人..."
              className="w-full h-32 p-4 bg-surface-container-low border-2 border-outline-variant/10 rounded-2xl text-sm focus:border-primary-container outline-none transition-all"
            />
            <div className="flex gap-3">
              <button 
                onClick={() => setShowRejectModal(null)}
                className="flex-1 py-3 bg-surface-container text-on-surface-variant rounded-xl font-bold text-xs uppercase tracking-widest"
              >
                取消
              </button>
              <button 
                disabled={!rejectionReason || !!processingId}
                onClick={handleReject}
                className="flex-1 py-3 bg-error text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-error/20 disabled:opacity-50"
              >
                确认拒绝
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
