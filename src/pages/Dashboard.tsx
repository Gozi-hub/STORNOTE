import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { cn, getShanghaiDateStr } from '@/src/lib/utils';
import { useTransactions } from '../contexts/TransactionContext';
import { useProducts } from '../contexts/ProductContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const mockBaseData = {
  '日': {
    comparisonText: '对比昨日',
  },
  '月': {
    comparisonText: '对比上月',
  },
  '年': {
    comparisonText: '对比上年',
  }
};

export default function Dashboard() {
  const { transactions, loading: transactionsLoading } = useTransactions();
  const { products } = useProducts();
  const [timeRange, setTimeRange] = useState<'日' | '月' | '年'>(() => {
    return (localStorage.getItem('stornote_dashboard_range') as '日' | '月' | '年') || '日';
  });

  // Sync range to localStorage
  useEffect(() => {
    localStorage.setItem('stornote_dashboard_range', timeRange);
  }, [timeRange]);

  const dashboardData = useMemo(() => {
    const now = new Date();
    const todayStr = getShanghaiDateStr(now);
    
    const totals = {
      revenue: 0,
      profit: 0,
      prevRevenue: 0,
      prevProfit: 0,
      monthRevenue: 0,
      monthProfit: 0,
      prevMonthRevenue: 0,
      prevMonthProfit: 0,
      yearRevenue: 0,
      yearProfit: 0,
      prevYearRevenue: 0,
      prevYearProfit: 0
    };

    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = getShanghaiDateStr(yesterdayDate);
    const thisMonthPrefix = todayStr.substring(0, 7);
    const lastMonthDateObj = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthPrefix = `${lastMonthDateObj.getFullYear()}-${String(lastMonthDateObj.getMonth() + 1).padStart(2, '0')}`;
    const currentYear = now.getFullYear();

    const dateMap = new Map<string, { income: number; profit: number }>();
    const monthDataMap = new Map<string, { income: number; profit: number }>();
    const yearDataMap = new Map<string, { income: number; profit: number }>();

    // Init maps for charts
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const s = getShanghaiDateStr(d);
      dateMap.set(s, { income: 0, profit: 0 });
    }
    
    // Only show months up to current month
    const currentMonth = now.getMonth() + 1;
    for (let i = 1; i <= currentMonth; i++) {
      monthDataMap.set(`${i}月`, { income: 0, profit: 0 });
    }
    
    for (let i = 5; i >= 0; i--) {
      yearDataMap.set(`${currentYear - i}年`, { income: 0, profit: 0 });
    }

    const productMap = new Map<string, any>(products.map(p => [p.id, p]));
    const productTransactions = transactions.filter(t => {
      const match = t.notes.match(/ProdID:([a-zA-Z0-9_-]+)/);
      return match && productMap.has(match[1]);
    });

    productTransactions.forEach(t => {
      const match = t.notes.match(/ProdID:([a-zA-Z0-9_-]+)/);
      if (!match) return;
      const pId = match[1];
      const p = productMap.get(pId);
      if (!p) return;

      const rev = t.type === 'income' ? t.amount : 0;
      const exp = t.type === 'expense' ? t.amount : 0;
      
      // Intelligent Profit Calculation: Subtract COGS (Cost of Goods Sold)
      let pro = 0;
      if (t.type === 'income') {
        const qtyMatch = t.notes.match(/Qty:(\d+(\.\d+)?)/);
        const count = qtyMatch ? parseFloat(qtyMatch[1]) : (t.amount / (p.price_value || 1));
        const costPerUnit = p.cost_price ?? (p.price_value * 0.7);
        pro = rev - (count * costPerUnit);
      } else {
        pro = rev - exp;
      }

      // Daily
      if (t.date === todayStr) {
        totals.revenue += rev;
        totals.profit += pro;
      } else if (t.date === yesterdayStr) {
        totals.prevRevenue += rev;
        totals.prevProfit += pro;
      }

      // Monthly
      if (t.date.startsWith(thisMonthPrefix)) {
        totals.monthRevenue += rev;
        totals.monthProfit += pro;
      } else if (t.date.startsWith(lastMonthPrefix)) {
        totals.prevMonthRevenue += rev;
        totals.prevMonthProfit += pro;
      }

      // Yearly
      const tYear = parseInt(t.date.substring(0, 4));
      if (tYear === currentYear) {
        totals.yearRevenue += rev;
        totals.yearProfit += pro;
      } else if (tYear === currentYear - 1) {
        totals.prevYearRevenue += rev;
        totals.prevYearProfit += pro;
      }

      // Charts
      if (dateMap.has(t.date)) {
        const entry = dateMap.get(t.date)!;
        entry.income += rev;
        entry.profit += pro;
      }

      if (tYear === currentYear) {
        const m = parseInt(t.date.substring(5, 7));
        const mLabel = `${m}月`;
        if (monthDataMap.has(mLabel)) {
          const entry = monthDataMap.get(mLabel)!;
          entry.income += rev;
          entry.profit += pro;
        }
      }

      const yLabel = `${tYear}年`;
      if (yearDataMap.has(yLabel)) {
        const entry = yearDataMap.get(yLabel)!;
        entry.income += rev;
        entry.profit += pro;
      }
    });

    const calculateTrend = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? '+100%' : '0%';
      const diff = ((curr - prev) / prev) * 100;
      return (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
    };

    const dayChart = Array.from(dateMap.entries()).map(([date, val]) => {
      const parts = date.split('-');
      return {
        name: `${parseInt(parts[1])}/${parseInt(parts[2])}`,
        income: val.income,
        profit: val.profit
      };
    });

    return {
      daily: {
        revenue: totals.revenue,
        profit: totals.profit,
        revenueTrend: calculateTrend(totals.revenue, totals.prevRevenue),
        profitTrend: calculateTrend(totals.profit, totals.prevProfit)
      },
      monthly: {
        revenue: totals.monthRevenue,
        profit: totals.monthProfit,
        revenueTrend: calculateTrend(totals.monthRevenue, totals.prevMonthRevenue),
        profitTrend: calculateTrend(totals.monthProfit, totals.prevMonthProfit)
      },
      yearly: {
        revenue: totals.yearRevenue,
        profit: totals.yearProfit,
        revenueTrend: calculateTrend(totals.yearRevenue, totals.prevYearRevenue),
        profitTrend: calculateTrend(totals.yearProfit, totals.prevYearProfit)
      },
      dayChart,
      monthChart: Array.from(monthDataMap.entries()).map(([name, val]) => ({ name, income: val.income, profit: val.profit })),
      yearChart: Array.from(yearDataMap.entries()).map(([name, val]) => ({ name, income: val.income, profit: val.profit }))
    };
  }, [transactions]);

  const currentData = useMemo(() => {
    const data = timeRange === '日' 
      ? { ...dashboardData.daily, chart: dashboardData.dayChart }
      : timeRange === '月' 
        ? { ...dashboardData.monthly, chart: dashboardData.monthChart }
        : { ...dashboardData.yearly, chart: dashboardData.yearChart };

    return {
      label: timeRange === '日' ? '今日' : timeRange === '月' ? '本月' : '今年',
      revenue: `¥${data.revenue.toLocaleString()}`,
      profit: `¥${data.profit.toLocaleString()}`,
      revenueTrend: data.revenueTrend,
      profitTrend: data.profitTrend,
      chart: data.chart,
      comparisonText: mockBaseData[timeRange].comparisonText
    };
  }, [timeRange, dashboardData]);

  const TrendBadge = ({ trend }: { trend: string }) => {
    const isPositive = trend.startsWith('+');
    const isNegative = trend.startsWith('-');
    
    return (
      <div className={cn(
        "flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-tight transition-colors",
        isPositive ? "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/50" : 
        isNegative ? "bg-error/5 text-error ring-1 ring-error/20" : 
        "bg-surface-container-highest/50 text-on-surface-variant ring-1 ring-outline-variant/20"
      )}>
        <span className="material-symbols-outlined text-[14px]">
          {isPositive ? 'trending_up' : isNegative ? 'trending_down' : 'trending_flat'}
        </span>
        {trend}
      </div>
    );
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">实时概览</p>
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-headline font-black text-primary-container">运营控制面板</h2>
          <div className="flex bg-surface-container-low p-1 rounded-xl ring-1 ring-outline-variant/10">
            {(['日', '月', '年'] as const).map((range) => (
              <button 
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  "px-5 py-1.5 text-xs font-bold rounded-lg transition-all",
                  timeRange === range 
                    ? "bg-white text-primary-container shadow-sm" 
                    : "text-on-surface-variant hover:text-primary-container"
                )}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-surface-container-high relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-primary/10 transition-colors"></div>
          <div className="relative z-10 flex justify-between items-start mb-6">
            <span className="text-sm font-bold text-on-surface-variant">总收入 (Total Revenue)</span>
            <TrendBadge trend={currentData.revenueTrend} />
          </div>
          <div className="relative z-10 flex items-baseline justify-between gap-3">
            <span className="text-4xl font-headline font-black text-primary-container tracking-tighter">{currentData.revenue}</span>
            <span className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest">{currentData.comparisonText}</span>
          </div>
          <div className="mt-6 h-1 w-3/4 bg-primary-container/20 rounded-full overflow-hidden">
            <div className="h-full w-full bg-primary-container rounded-full shadow-[0_0_8px_rgba(0,77,97,0.3)]"></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-surface-container-high relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-emerald-500/10 transition-colors"></div>
          <div className="relative z-10 flex justify-between items-start mb-6">
            <span className="text-sm font-bold text-on-surface-variant">净利润 (Net Profit)</span>
            <TrendBadge trend={currentData.profitTrend} />
          </div>
          <div className="relative z-10 flex items-baseline justify-between gap-3">
            <span className="text-4xl font-headline font-black text-primary-container tracking-tighter">{currentData.profit}</span>
            <span className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest">{currentData.comparisonText}</span>
          </div>
          <div className="mt-6 h-1 w-1/2 bg-emerald-500/20 rounded-full overflow-hidden">
            <div className="h-full w-full bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.3)]"></div>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-white p-10 rounded-2xl shadow-sm border border-outline-variant/10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div className="flex items-center gap-5">
            <div className="w-2 h-10 bg-primary-container rounded-full"></div>
            <div>
              <h3 className="text-2xl font-headline font-black text-primary-container leading-tight">
                {timeRange}度收入与利润趋势
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Trend Analysis</span>
                <div className="w-1 h-1 rounded-full bg-outline-variant"></div>
                <p className="text-xs font-bold text-on-surface-variant">分析{timeRange}度业绩波动与增长路径</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-8 px-6 py-3 bg-surface-container-low/50 rounded-2xl border border-outline-variant/5">
            <div className="flex items-center gap-3">
              <div className="w-3.5 h-3.5 rounded-md bg-primary-container shadow-sm"></div>
              <span className="text-xs font-black text-on-surface-variant uppercase tracking-wider">收入 Revenue</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3.5 h-3.5 rounded-md bg-emerald-400 shadow-sm"></div>
              <span className="text-xs font-black text-on-surface-variant uppercase tracking-wider">利润 Profit</span>
            </div>
          </div>
        </div>
        <div className="h-80 w-full min-h-[320px] relative overflow-hidden">
          {mounted && currentData.chart.length > 0 && (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={currentData.chart} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  interval={0}
                  tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 700 }}
                  dy={10}
                  height={50}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  itemSorter={(item) => (item.dataKey === 'income' ? -1 : 1)}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="income" name="收入" fill="#004d61" radius={[4, 4, 0, 0]} barSize={40} />
                <Bar dataKey="profit" name="利润" fill="#34d399" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

    </div>
  );
}
