import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { cn } from '@/src/lib/utils';
import { useTransactions } from '@/src/contexts/TransactionContext';
import { useAuth } from '@/src/contexts/AuthContext';

export default function Transactions() {
  const { user } = useAuth();
  const { addTransaction } = useTransactions();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!amount || !category || !date) {
      toast.error('请填写必要项（金额、类别、日期）');
      return;
    }

    if (!user) {
      toast.error('请先登录');
      return;
    }

    setLoading(true);
    try {
      await addTransaction({
        amount: parseFloat(amount),
        category,
        date,
        notes,
        type,
      });
      
      // Reset form
      setAmount('');
      setCategory('');
      setNotes('');
      toast.success('交易记录已保存');
    } catch (error: any) {
      console.error('Save transaction error:', error);
      toast.error('保存失败: ' + (error.message || '系统错误'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-outline-variant/10">
          <h2 className="text-xl font-black mb-5 tracking-tight text-primary">添加额外交易记录</h2>
          <div className="space-y-6">
            <div className="flex items-center gap-4 bg-surface-container-low p-1 rounded-lg w-fit">
              <button 
                onClick={() => setType('expense')}
                className={cn(
                  "px-5 py-1.5 rounded-md text-sm font-bold transition-all shadow-sm",
                  type === 'expense' ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-high"
                )}
              >
                支出
              </button>
              <button 
                onClick={() => setType('income')}
                className={cn(
                  "px-5 py-1.5 rounded-md text-sm font-bold transition-all shadow-sm",
                  type === 'income' ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-high"
                )}
              >
                收入
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">交易金额 (CNY)</label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-lg font-bold text-primary">¥</span>
                  <input 
                    className="w-full pl-8 pr-4 py-2 text-xl font-headline font-black text-primary bg-surface-container-highest/30 border-b-2 border-transparent focus:border-primary focus:ring-0 rounded-t-lg transition-all" 
                    placeholder="0.00" 
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  {type === 'expense' ? '费用类别' : '收入来源'}
                </label>
                <select 
                  className="w-full px-4 py-3 font-medium text-on-surface bg-surface-container-highest/30 border-b-2 border-transparent focus:border-primary focus:ring-0 rounded-t-lg appearance-none transition-all"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">请选择{type === 'expense' ? '类别' : '来源'}</option>
                  {type === 'expense' ? (
                    <>
                      <option value="货物运输">货物运输 (Cargo)</option>
                      <option value="物流仓储">物流仓储 (Logistics)</option>
                      <option value="场地租金">场地租金 (Rent)</option>
                      <option value="人工成本">人工成本 (Labor)</option>
                      <option value="水电杂费">水电杂费 (Utilities)</option>
                      <option value="其他支出">其他支出 (Others)</option>
                    </>
                  ) : (
                    <>
                      <option value="产品销售">产品销售 (Sales)</option>
                      <option value="服务收入">服务收入 (Service)</option>
                      <option value="退税收入">退税收入 (Tax Refund)</option>
                      <option value="投资收益">投资收益 (Investments)</option>
                      <option value="其他收入">其他收入 (Others)</option>
                    </>
                  )}
                </select>
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">交易日期</label>
                <input 
                  className="w-full px-4 py-3 font-medium text-on-surface bg-surface-container-highest/30 border-b-2 border-transparent focus:border-primary focus:ring-0 rounded-t-lg transition-all" 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">备注说明</label>
                <input 
                  className="w-full px-4 py-3 font-medium text-on-surface bg-surface-container-highest/30 border-b-2 border-transparent focus:border-primary focus:ring-0 rounded-t-lg transition-all" 
                  placeholder="输入补充信息..." 
                  type="text" 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

        <div className="pt-6 flex justify-end">
          <button 
            onClick={handleSubmit}
            disabled={loading}
            className={cn(
              "flex items-center gap-2 px-10 py-4 bg-primary text-on-primary rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-0.5 transition-all active:scale-95 group relative overflow-hidden",
              loading && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="material-symbols-outlined text-xl group-hover:scale-110 transition-transform">
              {loading ? 'sync' : 'save'}
            </span>
            {loading ? '正在保存...' : '保存交易记录'}
          </button>
        </div>
      </div>
    </div>
  </div>
);
}
