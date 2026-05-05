import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { cn } from '@/src/lib/utils';
import { useTransactions, Transaction } from '@/src/contexts/TransactionContext';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, X } from 'lucide-react';

export default function Reports() {
  const [timeRange, setTimeRange] = useState(() => {
    return localStorage.getItem('reports_time_range') || '月';
  });
  const { transactions, loading, deleteTransaction } = useTransactions();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [reportType, setReportType] = useState<'expense' | 'income'>('expense');
  const [currentPage, setCurrentPage] = useState(1);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const itemsPerPage = 5;
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem('reports_time_range', timeRange);
  }, [timeRange]);

  const confirmDelete = async () => {
    if (!transactionToDelete) return;
    try {
      await deleteTransaction(transactionToDelete.id);
      setTransactionToDelete(null);
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const filteredByTimeRange = transactions.filter(t => {
    // Only include transactions that are NOT sales or inventory purchases
    if (t.category === '销售收入' || t.category === '进货支出') return false;

    const todayStr = new Date().toISOString().split('T')[0];
    if (timeRange === '日') {
      return t.date === todayStr;
    } else if (timeRange === '月') {
      return t.date.startsWith(todayStr.substring(0, 7));
    } else if (timeRange === '年') {
      return t.date.startsWith(todayStr.substring(0, 4));
    }
    return true;
  });

  const totalIncome = filteredByTimeRange
    .filter(t => t.type === 'income' && t.category !== '销售收入')
    .reduce((acc, t) => acc + t.amount, 0);

  const totalExpense = filteredByTimeRange
    .filter(t => t.type === 'expense' && t.category !== '进货支出')
    .reduce((acc, t) => acc + t.amount, 0);

  const expenseByCategory = filteredByTimeRange
    .filter(t => t.type === 'expense' && t.category !== '进货支出')
    .reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

  const incomeByCategory = filteredByTimeRange
    .filter(t => t.type === 'income' && t.category !== '销售收入')
    .reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

  const currentCategories = reportType === 'expense' ? expenseByCategory : incomeByCategory;
  const currentTotal = reportType === 'expense' ? totalExpense : totalIncome;

  const categoryRatios = Object.entries(currentCategories)
    .map(([label, amount]: [string, number]) => ({
      label,
      amount,
      percentage: currentTotal > 0 ? (amount / currentTotal) * 100 : 0
    }))
    .sort((a, b) => (b.amount as number) - (a.amount as number));

  const CHART_COLORS = [
    '#6366f1', // Indigo
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#f43f5e', // Rose
    '#06b6d4', // Cyan
    '#64748b'  // Slate
  ];

  const getBarChartData = () => {
    const data: { label: string; income: number; expense: number; active?: boolean }[] = [];
    const now = new Date();

    if (timeRange === '日') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        // 获取 YYYY-MM-DD 格式，确保与交易数据匹配
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        const dayTransactions = transactions.filter(t => t.date === dateStr);
        data.push({
          label: `${d.getMonth() + 1}/${d.getDate()}`,
          income: dayTransactions.filter(t => t.type === 'income' && t.category !== '销售收入').reduce((acc, t) => acc + t.amount, 0),
          expense: dayTransactions.filter(t => t.type === 'expense' && t.category !== '进货支出').reduce((acc, t) => acc + t.amount, 0),
          active: i === 0
        });
      }
    } else if (timeRange === '月') {
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      for (let i = 0; i <= currentMonth; i++) {
        const monthYear = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
        const monthTransactions = transactions.filter(t => t.date.startsWith(monthYear));
        data.push({
          label: `${i + 1}月`,
          income: monthTransactions.filter(t => t.type === 'income' && t.category !== '销售收入').reduce((acc, t) => acc + t.amount, 0),
          expense: monthTransactions.filter(t => t.type === 'expense' && t.category !== '进货支出').reduce((acc, t) => acc + t.amount, 0),
          active: i === currentMonth
        });
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const year = now.getFullYear() - i;
        const yearTransactions = transactions.filter(t => t.date.startsWith(String(year)));
        data.push({
          label: `${year}年`,
          income: yearTransactions.filter(t => t.type === 'income' && t.category !== '销售收入').reduce((acc, t) => acc + t.amount, 0),
          expense: yearTransactions.filter(t => t.type === 'expense' && t.category !== '进货支出').reduce((acc, t) => acc + t.amount, 0),
          active: i === 0
        });
      }
    }

    // Normalize for bar heights (0-100%)
    const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expense)), 100);
    return data.map(d => ({
      ...d,
      incomeHeight: (d.income / maxVal) * 100,
      expenseHeight: (d.expense / maxVal) * 100
    }));
  };

  const barChartData = getBarChartData();
  const sortedTransactions = transactions
    .filter(t => t.category !== '销售收入' && t.category !== '进货支出')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / itemsPerPage));

  const handleExportExcel = () => {
    if (sortedTransactions.length === 0) {
      toast.error('当前列表暂无数据可导出');
      return;
    }

    toast.loading('正在准备导出文件...', { id: 'export-loading' });

    try {
      const exportData = sortedTransactions.map(t => ({
        '交易日期': t.date,
        '费用类型': t.type === 'income' ? '收入' : '支出',
        '交易分类': t.category,
        '交易金额 (CNY)': t.type === 'expense' ? -t.amount : t.amount,
        '备注/说明': t.notes || '无详情'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "重大交易明细");
      
      // 优化列宽
      const colWidths = [
        { wch: 15 }, // 交易日期
        { wch: 10 }, // 费用类型
        { wch: 15 }, // 交易分类
        { wch: 15 }, // 交易金额
        { wch: 40 }, // 备注/说明
      ];
      ws['!cols'] = colWidths;

      XLSX.writeFile(wb, `财务重大交易明细_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`);
      toast.success('导出成功', { id: 'export-loading' });
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('导出失败，请检查浏览器设置或重试', { id: 'export-loading' });
    }
  };

  return (
    <div className="space-y-12">
      {/* Header Section */}
      <div className="flex flex-row items-center justify-between gap-4 border-b border-outline-variant/10 pb-6">
        <h1 className="text-2xl font-black tracking-tight text-primary">财务分析报告</h1>
        
        {/* Time Range Selector */}
        <div className="inline-flex bg-surface-container/50 p-1 rounded-lg border border-surface-container-high shrink-0">
          {['日', '月', '年'].map((label, i) => (
            <button 
              key={label}
              onClick={() => setTimeRange(label)}
              className={cn(
                "px-4 py-1.5 text-xs font-bold transition-all",
                timeRange === label ? "text-primary bg-white rounded shadow-sm ring-1 ring-black/5" : "text-on-surface-variant hover:text-primary",
                i > 0 && timeRange !== label && "border-l border-outline-variant/20"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-2xl border-l-4 border-primary shadow-sm hover:shadow-md transition-all">
          <div className="flex justify-between items-start mb-6">
            <span className="text-[15px] leading-[20px] text-left font-black text-on-surface-variant tracking-[0.1em] uppercase">额外总收入 (CNY)</span>
            <div className="p-2 bg-primary/5 rounded-lg text-primary">
              <span className="material-symbols-outlined">trending_up</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-4xl font-black text-primary tracking-tighter">¥{totalIncome.toLocaleString()}</span>
            <span className="text-xs font-bold text-on-surface-variant/40 mt-3 flex items-center gap-1.5">
              <span className="bg-surface-container-high px-1.5 py-0.5 rounded">实时更新</span>
              <span className="font-medium tracking-wide italic">数据由云端实时同步</span>
            </span>
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl border-l-4 border-error shadow-sm hover:shadow-md transition-all">
          <div className="flex justify-between items-start mb-6">
            <span className="text-[15px] leading-[20px] font-black text-on-surface-variant tracking-[0.1em] uppercase">额外总支出 (CNY)</span>
            <div className="p-2 bg-error/5 rounded-lg text-error">
              <span className="material-symbols-outlined">trending_down</span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-4xl font-black text-primary tracking-tighter">¥{totalExpense.toLocaleString()}</span>
            <span className="text-xs font-bold text-on-surface-variant/40 mt-3 flex items-center gap-1.5">
              <span className="bg-surface-container-high px-1.5 py-0.5 rounded">实时更新</span>
              <span className="font-medium tracking-wide italic">收支明细由记账本同步</span>
            </span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-8">
        <div className="lg:col-span-4 bg-white p-8 rounded-2xl shadow-sm border border-surface-container-high">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
            <h3 className="text-xl font-black text-primary">{timeRange}度收支对比</h3>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-primary"></div>
                <span className="text-xs font-bold text-on-surface-variant">额外总收入</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-primary-container/30"></div>
                <span className="text-xs font-bold text-on-surface-variant">额外总支出</span>
              </div>
            </div>
          </div>
          <div className="h-72 flex items-end justify-between px-1 sm:px-2 gap-1 sm:gap-2 lg:gap-4">
            {barChartData.map((d) => (
              <div key={d.label} className="flex flex-col items-center gap-3 flex-1 group min-w-0">
                <div className="flex gap-1 sm:gap-1.5 items-end h-56 w-full justify-center">
                  <div 
                    className="bg-primary w-full max-w-[14px] sm:max-w-[18px] rounded-t-lg transition-all opacity-90 group-hover:opacity-100 relative group/bar" 
                    style={{ height: `${d.incomeHeight}%` }}
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-black px-1.5 py-0.5 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-sm">
                      ¥{d.income.toLocaleString()}
                    </div>
                  </div>
                  <div 
                    className="bg-primary-container/30 w-full max-w-[14px] sm:max-w-[18px] rounded-t-lg transition-all opacity-90 group-hover:opacity-100 relative group/bar" 
                    style={{ height: `${d.expenseHeight}%` }}
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-700 text-white text-[10px] font-black px-1.5 py-0.5 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-sm">
                      ¥{d.expense.toLocaleString()}
                    </div>
                  </div>
                </div>
                <span className={cn(
                  "text-[9px] sm:text-[11px] font-bold whitespace-nowrap transition-all", 
                  d.active ? "text-primary" : "text-slate-400"
                )}>
                  {d.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 bg-white p-8 rounded-2xl shadow-sm border border-surface-container-high flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-primary">额外总{reportType === 'expense' ? '支出' : '收入'}分类占比</h3>
            <div className="flex bg-surface-container-low p-1 rounded-lg border border-outline-variant/10">
              <button 
                onClick={() => { setReportType('expense'); setActiveCategory(null); }}
                className={cn(
                  "px-3 py-1 text-xs font-bold transition-all",
                  reportType === 'expense' ? "bg-white text-primary rounded shadow-sm" : "text-on-surface-variant hover:text-primary"
                )}
              >
                支出
              </button>
              <button 
                onClick={() => { setReportType('income'); setActiveCategory(null); }}
                className={cn(
                  "px-3 py-1 text-xs font-bold transition-all",
                  reportType === 'income' ? "bg-white text-primary rounded shadow-sm" : "text-on-surface-variant hover:text-primary"
                )}
              >
                收入
              </button>
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center items-center">
            <div className="relative w-44 h-44 mb-10 group">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" fill="transparent" r="15.915" stroke="#f1f5f9" strokeWidth="3.5"></circle>
                {categoryRatios.length === 0 ? (
                  <circle cx="18" cy="18" fill="transparent" r="15.915" stroke="#f1f5f9" strokeWidth="3.5" />
                ) : (
                  categoryRatios.reduce((acc, cat, idx) => {
                    const dashArray = `${cat.percentage} ${100 - cat.percentage}`;
                    const dashOffset = -acc.total;
                    const isActive = activeCategory === cat.label;
                    acc.elements.push(
                      <circle 
                        key={cat.label}
                        cx="18" cy="18" fill="transparent" r="15.915" 
                        stroke={CHART_COLORS[idx % CHART_COLORS.length]} 
                        strokeDasharray={dashArray} 
                        strokeDashoffset={dashOffset} 
                        strokeWidth={isActive ? "4.5" : "3.5"}
                        style={{ transition: 'all 0.3s ease', cursor: 'pointer', opacity: activeCategory && !isActive ? 0.3 : 1 }}
                        onMouseEnter={() => setActiveCategory(cat.label)}
                        onMouseLeave={() => setActiveCategory(null)}
                      />
                    );
                    acc.total += cat.percentage;
                    return acc;
                  }, { elements: [] as React.ReactNode[], total: 0 }).elements
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className={cn(
                  "text-2xl font-black transition-all duration-300 tracking-tighter",
                  activeCategory ? "text-primary scale-110" : "text-primary"
                )}>
                  ¥{activeCategory 
                    ? categoryRatios.find(c => c.label === activeCategory)?.amount.toLocaleString() 
                    : currentTotal.toLocaleString()
                  }
                </span>
                <span className="text-[10px] text-on-surface-variant font-black uppercase tracking-[0.2em] opacity-60 mt-1">
                  {activeCategory || `总${reportType === 'expense' ? '支出' : '收入'}`}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-y-4 gap-x-6 w-full">
              {categoryRatios.length > 0 ? categoryRatios.slice(0, 4).map((item, idx) => (
                <div 
                  key={item.label} 
                  onMouseEnter={() => setActiveCategory(item.label)}
                  onMouseLeave={() => setActiveCategory(null)}
                  className={cn(
                    "flex items-center gap-2.5 transition-all duration-200 cursor-default",
                    activeCategory === item.label ? "translate-x-1" : "opacity-70 hover:opacity-100"
                  )}
                >
                  <div className={cn("w-2.5 h-2.5 rounded-full text-white")} style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}></div>
                  <span className={cn(
                    "text-[10px] font-bold text-on-surface-variant line-clamp-1",
                    activeCategory === item.label && "text-primary"
                  )}>
                    {item.label} ({item.percentage.toFixed(0)}%)
                  </span>
                </div>
              )) : (
                <div className="col-span-2 text-center text-[10px] text-slate-400 font-bold italic">暂无{reportType === 'expense' ? '支出' : '收入'}数据</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white rounded-2xl shadow-sm border border-surface-container-high overflow-hidden">
        <div className="p-8 border-b border-surface-container-high flex flex-col md:flex-row md:items-center justify-between gap-6">
          <h3 className="text-xl font-black text-primary">近期重大交易明细</h3>
          <div className="flex gap-3">
            <button 
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-xs font-black rounded-lg hover:shadow-lg hover:shadow-primary/20 transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">table_chart</span>
              导出 Excel
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-surface-container-low/50 text-[11px] font-black text-on-surface-variant tracking-[0.1em] uppercase">
              <tr>
                <th className="px-8 py-5">交易日期</th>
                <th className="px-8 py-5">明细描述</th>
                <th className="px-8 py-5">交易分类</th>
                <th className="px-8 py-5 text-right">交易金额</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-high">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-8 py-10 text-center text-on-surface-variant font-bold">正在加载交易记录...</td>
                </tr>
              ) : sortedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-8 py-10 text-center text-on-surface-variant font-bold">暂无交易记录</td>
                </tr>
              ) : (
                sortedTransactions.slice(
                  (currentPage - 1) * itemsPerPage,
                  currentPage * itemsPerPage
                ).map((tr) => (
                  <tr 
                    key={tr.id} 
                    onClick={() => setTransactionToDelete(tr)}
                    className="hover:bg-surface-container-low transition-colors cursor-pointer group"
                  >
                    <td className="px-8 py-6 text-sm text-on-surface-variant font-bold">{tr.date}</td>
                    <td className="px-8 py-6 text-sm font-black text-primary group-hover:text-primary transition-colors">
                      {tr.notes || '无详情描述'}
                    </td>
                    <td className="px-8 py-6">
                      <span className="px-3 py-1 bg-surface-container-high text-on-surface-variant rounded-md text-[10px] font-black">{tr.category}</span>
                    </td>
                    <td className={cn("px-8 py-6 text-right font-black", tr.type === 'expense' ? "text-error" : "text-primary")}>
                      {tr.type === 'expense' ? '-' : '+'} ¥{tr.amount.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-6 bg-surface-container-low/20 flex flex-col md:flex-row items-center justify-between border-t border-surface-container-high gap-6">
          <div className="order-2 md:order-1 text-[10px] font-bold text-slate-400 italic">
          </div>
          
          <div className="flex items-center gap-6 order-1 md:order-2">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-outline-variant/30 text-primary disabled:opacity-30 hover:shadow-md transition-all"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            
            <div className="flex flex-col items-center">
              <span className="text-[11px] font-black text-on-surface-variant uppercase tracking-widest leading-none">第 {currentPage} 页</span>
              <span className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">共 {totalPages} 页</span>
            </div>

            <button 
              disabled={currentPage >= totalPages || totalPages === 0}
              onClick={() => setCurrentPage(p => p + 1)}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-outline-variant/30 text-primary disabled:opacity-30 hover:shadow-md transition-all"
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
          
          <div className="order-3 flex items-center gap-1.5 opacity-60">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            <span className="text-[10px] font-black text-on-surface-variant">
              已加载 {sortedTransactions.length} 条记录
            </span>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {transactionToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-6">
                <button 
                  onClick={() => setTransactionToDelete(null)}
                  className="p-2 hover:bg-surface-container-low rounded-full transition-colors text-on-surface-variant"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-col items-center text-center space-y-6">
                <div className="w-16 h-16 bg-error/10 rounded-2xl flex items-center justify-center text-error mb-2">
                  <AlertCircle className="w-8 h-8" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-xl font-black text-primary">确认删除交易？</h3>
                  <p className="text-sm font-medium text-on-surface-variant leading-relaxed px-4">
                    您正准备删除该笔记账记录，此操作将同步影响云端数据且无法撤销。
                  </p>
                </div>

                <div className="w-full bg-surface-container-low/50 p-4 rounded-xl border border-surface-container-high space-y-2 text-left">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-on-surface-variant/60">日期</span>
                    <span className="text-on-surface-variant">{transactionToDelete.date}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-on-surface-variant/60">类别</span>
                    <span className="text-primary">{transactionToDelete.category}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-on-surface-variant/60">金额</span>
                    <span className="text-primary font-black">¥{transactionToDelete.amount.toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex gap-3 w-full pt-4">
                  <button 
                    onClick={() => setTransactionToDelete(null)}
                    className="flex-1 px-6 py-3 bg-surface-container-high text-on-surface-variant text-sm font-bold rounded-xl hover:bg-surface-container-highest transition-all"
                  >
                    取消
                  </button>
                  <button 
                    onClick={confirmDelete}
                    className="flex-1 px-6 py-3 bg-primary text-white text-sm font-bold rounded-xl hover:shadow-lg hover:shadow-primary/20 transition-all"
                  >
                    确认删除
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
