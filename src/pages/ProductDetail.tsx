import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useProducts } from '../contexts/ProductContext';
import { useTransactions } from '../contexts/TransactionContext';
import { cn, getShanghaiDateStr } from '@/src/lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import toast from 'react-hot-toast';

interface Product {
  id: string;
  user_id: string;
  name: string;
  sku: string;
  price_value: number;
  cost_price?: number;
  base_inventory?: number;
  inventory_threshold?: number;
  status: string;
  status_color: string;
  is_out_of_stock: boolean;
  created_at: string;
}

interface Transaction {
  id: string;
  date: string;
  amount: number;
  type: 'income' | 'expense';
  notes: string;
}

const FinancialChart = React.memo(({ data, currentRevenue, currentProfit, onOpenCalendar }: { 
  data: any[], 
  currentRevenue: number, 
  currentProfit: number,
  onOpenCalendar: () => void
}) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const formatYAxis = (value: number) => {
    if (value === 0) return '0';
    if (value >= 10000) return `¥${(value / 10000).toFixed(1)}w`;
    if (value >= 1000) return `¥${(value / 1000).toFixed(1)}k`;
    return `¥${value}`;
  };

  return (
    <div className="w-full bg-white rounded-2xl border border-surface-container-high shadow-sm overflow-hidden flex flex-col">
      <div className="p-8 flex justify-between items-center border-b border-surface-container-low">
        <div className="flex items-center gap-4">
          <div className="w-1 h-8 bg-primary-container rounded-full"></div>
          <div>
            <h3 className="font-headline font-black text-primary text-xl tracking-tight leading-none">财务业绩分析</h3>
            <p className="text-on-surface-variant text-xs font-medium mt-1.5">基于日历销量的营收与利润趋势</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-2.5 whitespace-nowrap">
            <div className="w-2.5 h-2.5 rounded bg-primary shrink-0"></div>
            <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">总收入</span>
          </div>
          <div className="flex items-center gap-2.5 whitespace-nowrap">
            <div className="w-2.5 h-2.5 rounded bg-emerald-400 shrink-0"></div>
            <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">净利润</span>
          </div>
        </div>
      </div>
      
      <div className="p-6 bg-surface-container-lowest/30 border-b border-surface-container-low flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={onOpenCalendar}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:shadow-lg transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-lg">calendar_month</span>
            填入销量数据
          </button>
          <p className="text-[10px] text-on-surface-variant font-medium">点击按钮在日历中记录每日销售情况</p>
        </div>
      </div>

      <div className="p-6 h-[320px] w-full flex justify-center relative overflow-hidden">
        <div className="w-full h-full max-w-4xl min-h-[280px]">
          {mounted && data.length > 0 && (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={data} margin={{ top: 10, right: 25, left: 0, bottom: 10 }}>
              <defs>
                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#000" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#000" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f3f4" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 600, fill: '#70757a' }}
                dy={10}
                interval={0}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 600, fill: '#70757a' }}
                tickFormatter={formatYAxis}
                width={50}
              />
              <Tooltip 
                contentStyle={{ 
                  borderRadius: '16px', 
                  border: 'none', 
                  boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
                  padding: '12px 16px'
                }}
                itemStyle={{ fontSize: '12px', fontWeight: 700, padding: '2px 0' }}
                formatter={(value: number, name: string) => [`¥${value.toLocaleString()}`, name]}
                itemSorter={(item) => (item.dataKey === 'revenue' ? -1 : 1)}
                cursor={{ stroke: '#000', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area 
                 type="monotone" 
                 dataKey="revenue" 
                 stroke="#000" 
                 strokeWidth={3} 
                 fillOpacity={1} 
                 fill="url(#colorRev)" 
                 name="总收入" 
                 animationDuration={1000}
               />
               <Area 
                 type="monotone" 
                 dataKey="profit" 
                 stroke="#10b981" 
                 strokeWidth={2.5} 
                 fill="transparent" 
                 name="净利润" 
                 animationDuration={1200}
               />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </div>
      </div>
  </div>
);
});

const CalendarDay = React.memo(({ day, dateStr, salesValue, isSelected, onClick }: {
  day: number,
  dateStr: string,
  salesValue: number | undefined,
  isSelected: boolean,
  onClick: (day: number) => void
}) => {
  const hasData = salesValue !== undefined;
  
  return (
    <button 
      onClick={() => onClick(day)}
      className={cn(
        "aspect-square rounded-xl flex flex-col items-center justify-center transition-all relative group",
        isSelected ? "bg-primary text-white shadow-lg scale-105 z-10" : "hover:bg-surface-container",
        hasData && !isSelected && "bg-primary/5 text-primary"
      )}
    >
      <span className="text-sm font-bold">{day}</span>
      {hasData && (
        <span className={cn(
          "text-[8px] font-black mt-0.5",
          isSelected ? "text-white/80" : "text-primary/60"
        )}>
          {salesValue}
        </span>
      )}
    </button>
  );
});

const CalendarGrid = React.memo(({ currentYear, currentMonth, selectedDate, dailySales, onDayClick }: {
  currentYear: number,
  currentMonth: number,
  selectedDate: string,
  dailySales: Record<string, number>,
  onDayClick: (day: number) => void
}) => {
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  return (
    <div className="grid grid-cols-7 gap-2 mb-8">
      {['日', '一', '二', '三', '四', '五', '六'].map(d => (
        <div key={d} className="text-center text-[10px] font-black text-on-surface-variant/40 uppercase py-2">{d}</div>
      ))}
      {Array.from({ length: firstDayOfMonth }).map((_, i) => (
        <div key={`empty-${i}`} className="aspect-square"></div>
      ))}
      {Array.from({ length: daysInMonth }).map((_, i) => {
        const day = i + 1;
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return (
          <CalendarDay 
            key={day}
            day={day}
            dateStr={dateStr}
            salesValue={dailySales[dateStr]}
            isSelected={selectedDate === dateStr}
            onClick={onDayClick}
          />
        );
      })}
    </div>
  );
});

const DeleteConfirmationModal = React.memo(({ 
  isOpen, 
  onClose, 
  onConfirm,
  productName
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onConfirm: () => void;
  productName: string;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-outline-variant/10 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-error-container/10 text-error rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-4xl">delete_forever</span>
          </div>
          <h3 className="text-xl font-headline font-black text-on-surface mb-3">确认删除产品？</h3>
          <p className="text-on-surface-variant text-sm leading-relaxed mb-8">
            您确定要删除 <span className="font-bold text-on-surface">"{productName}"</span> 吗？此操作将永久移除该产品及其所有销售记录，无法撤销。
          </p>
          <div className="flex flex-col gap-3">
            <button 
              onClick={onConfirm}
              className="w-full py-3.5 bg-error text-white font-bold rounded-full shadow-lg shadow-error/20 hover:bg-error/90 active:scale-95 transition-all"
            >
              确认删除
            </button>
            <button 
              onClick={onClose}
              className="w-full py-3.5 bg-surface-container-highest text-on-surface-variant font-bold rounded-xl hover:bg-surface-container-highest/80 active:scale-95 transition-all"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

const SalesCalendarModal = React.memo(({ 
  isOpen, 
  onClose, 
  initialSales, 
  onSave 
}: {
  isOpen: boolean;
  onClose: () => void;
  initialSales: Record<string, number>;
  onSave: (sales: Record<string, number>) => void;
}) => {
  const now = new Date();
  const shanghaiDateStr = getShanghaiDateStr(now);
  const shanghaiMonth = parseInt(shanghaiDateStr.split('-')[1]) - 1;
  const [tempSales, setTempSales] = useState<Record<string, number>>(initialSales);
  const [currentYear, setCurrentYear] = useState(() => {
    const yearFromDate = shanghaiDateStr.split('-')[0];
    return parseInt(yearFromDate);
  });
  const [isEditingYear, setIsEditingYear] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(shanghaiMonth);
  const [selectedDate, setSelectedDate] = useState<string>(shanghaiDateStr);
  const [localInput, setLocalInput] = useState<string>('0');

  useEffect(() => {
    if (isOpen) {
      setTempSales(initialSales);
      // Reset view to month and year of the last selected date or today
      if (selectedDate) {
        const [y, m] = selectedDate.split('-').map(Number);
        setCurrentYear(y);
        setCurrentMonth(m - 1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialSales]);

  useEffect(() => {
    setLocalInput((tempSales[selectedDate] || 0).toString());
  }, [selectedDate, tempSales]);

  // Sync selectedDate when year or month changes to prevent value carry-over from previous context
  useEffect(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    if (y !== currentYear || m !== currentMonth + 1) {
      const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
      const safeDay = Math.min(d, lastDay);
      const newDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
      if (selectedDate !== newDateStr) {
        setSelectedDate(newDateStr);
      }
    }
  }, [currentYear, currentMonth, selectedDate]);

  const handleDayClick = useCallback((day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
  }, [currentMonth, currentYear]);

  const handleInputChange = useCallback((val: string) => {
    setLocalInput(val);
    const num = Math.max(0, Math.floor(Number(val)));
    
    setTempSales(prev => {
      if (prev[selectedDate] === num) return prev;
      return { ...prev, [selectedDate]: num };
    });
  }, [selectedDate]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-outline-variant/10 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">calendar_month</span>
            <div className="flex items-center gap-1.5">
              {isEditingYear ? (
                <div className="flex items-center gap-1 animate-in zoom-in-95 duration-200">
                  <input 
                    autoFocus
                    type="number"
                    className="w-20 px-2 py-0.5 bg-white border-b-2 border-primary outline-none text-xl font-black text-primary text-center"
                    value={currentYear}
                    onChange={(e) => setCurrentYear(parseInt(e.target.value) || new Date().getFullYear())}
                    onBlur={() => setIsEditingYear(false)}
                    onKeyDown={(e) => e.key === 'Enter' && setIsEditingYear(false)}
                  />
                  <span className="text-xl font-black text-primary">年</span>
                </div>
              ) : (
                <span 
                  onClick={() => setIsEditingYear(true)}
                  className="text-xl font-black text-primary hover:bg-primary/10 px-2 py-0.5 rounded-lg cursor-pointer transition-colors group flex items-center gap-1"
                >
                  {currentYear}年
                  <span className="material-symbols-outlined text-sm opacity-0 group-hover:opacity-40 transition-opacity">edit</span>
                </span>
              )}
              <h3 className="text-xl font-black text-on-surface">销量录入</h3>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-container rounded-full transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => {
                  if (currentMonth === 0) {
                    setCurrentYear(prev => prev - 1);
                    setCurrentMonth(11);
                  } else {
                    setCurrentMonth(prev => prev - 1);
                  }
                }}
                className="p-2 hover:bg-surface-container rounded-full transition-colors"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <h4 className="text-lg font-black text-primary min-w-[100px] text-center">
                {['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'][currentMonth]}
              </h4>
              <button 
                onClick={() => {
                  if (currentMonth === 11) {
                    setCurrentYear(prev => prev + 1);
                    setCurrentMonth(0);
                  } else {
                    setCurrentMonth(prev => prev + 1);
                  }
                }}
                className="p-2 hover:bg-surface-container rounded-full transition-colors"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
            <button 
              onClick={() => setIsEditingYear(true)}
              className="text-xs font-bold text-on-surface-variant bg-surface-container px-3 py-1 rounded-full hover:bg-surface-container-highest transition-colors cursor-pointer flex items-center gap-1 group"
            >
              {currentYear}年
              <span className="material-symbols-outlined text-[10px] opacity-0 group-hover:opacity-40 transition-opacity">edit</span>
            </button>
          </div>

          <CalendarGrid 
            currentYear={currentYear}
            currentMonth={currentMonth} 
            selectedDate={selectedDate} 
            dailySales={tempSales} 
            onDayClick={handleDayClick} 
          />

          <div className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">已选日期</span>
                <span className="text-sm font-black text-primary">{selectedDate}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">当日销量</span>
                <div className="flex items-center gap-2 mt-1">
                  <input 
                    type="number"
                    min="0"
                    className="w-24 px-3 py-2 bg-white border border-outline-variant/20 rounded-xl text-center text-lg font-black text-primary focus:border-primary outline-none shadow-sm"
                    value={localInput}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                  <span className="text-xs font-bold text-on-surface-variant">件</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-outline-variant/10 bg-white flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-3 text-sm font-bold text-on-surface-variant hover:bg-surface-container rounded-xl transition-all"
          >
            取消
          </button>
          <button 
            onClick={() => onSave(tempSales)}
            className="px-8 py-3 bg-primary text-white rounded-full font-bold hover:shadow-lg active:scale-95 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">check</span>
            确认并保存
          </button>
        </div>
      </div>
    </div>
  );
});

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { deleteProduct, updateProduct, products } = useProducts();
  const { transactions: globalTransactions, fetchTransactions, loading: globalTransactionsLoading } = useTransactions();

  const [product, setProduct] = useState<Product | null>(() => {
    if (id && products.length > 0) {
      return products.find(p => p.id === id) || null;
    }
    return null;
  });

  const getInitialMeta = useCallback(() => {
    if (!id) return { cp: '0', bi: 0, it: 20 };
    
    // 1. Try context if available
    const contextProd = products.find(p => p.id === id);
    if (contextProd) {
      return {
        cp: String(contextProd.cost_price ?? 0),
        bi: contextProd.base_inventory ?? 0,
        it: contextProd.inventory_threshold ?? 20
      };
    }
    
    // 2. Try localStorage
    try {
      const saved = localStorage.getItem(`stornote_meta_${id}`);
      if (saved) {
        const meta = JSON.parse(saved);
        return {
          cp: String(meta.costPrice ?? 0),
          bi: meta.baseInventory ?? 0,
          it: meta.inventoryThreshold ?? 20
        };
      }
    } catch (e) {}
    
    return { cp: '0', bi: 0, it: 20 };
  }, [id, products]);

  const initialMeta = useMemo(() => getInitialMeta(), [getInitialMeta]);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(product?.name || '');
  const [unitPrice, setUnitPrice] = useState<string>(product?.price_value != null ? String(product.price_value) : '0');
  const [costPrice, setCostPrice] = useState<string>(initialMeta.cp);
  const [baseInventory, setBaseInventory] = useState<number>(initialMeta.bi);
  const [inventoryThreshold, setInventoryThreshold] = useState<number>(initialMeta.it);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isSavingNameRef = useRef(false);
  
  const [timeRange, setTimeRange] = useState<'日' | '月' | '年'>(() => {
    return (localStorage.getItem('stornote_detail_range') as '日' | '月' | '年') || '日';
  });

  const [loading, setLoading] = useState(false);
  const transactionsLoading = globalTransactionsLoading;

  // Filter transactions for this specific product from global context
  const transactions = useMemo(() => {
    if (!id) return [];
    return globalTransactions.filter(t => t.notes && t.notes.includes(`ProdID:${id}`));
  }, [globalTransactions, id]);

  // Synchronize component state with ProductContext or LocalStorage updates
  useEffect(() => {
    if (!id) return;
    
    // Resolve exact metadata from best available source
    const savedMetaStr = localStorage.getItem(`stornote_meta_${id}`);
    let meta: any = null;
    try { if (savedMetaStr) meta = JSON.parse(savedMetaStr); } catch (e) {}

    const p = products.find(prod => prod.id === id);
    if (p) {
      setProduct(p);
      if (!isEditingName) setEditedName(p.name || '');
      setUnitPrice(prev => {
        const freshVal = p.price_value != null ? String(p.price_value) : '0';
        return prev !== freshVal ? freshVal : prev;
      });
    }

    const resolvedCP = String(p?.cost_price ?? meta?.costPrice ?? '0');
    const resolvedBI = p?.base_inventory ?? meta?.baseInventory ?? 0;
    const resolvedIT = p?.inventory_threshold ?? meta?.inventoryThreshold ?? 20;

    // Use a small delay for state updates if they haven't settled to avoid race conditions with initial render
    setCostPrice(prev => prev !== resolvedCP ? resolvedCP : prev);
    setBaseInventory(prev => prev !== resolvedBI ? resolvedBI : prev);
    setInventoryThreshold(prev => prev !== resolvedIT ? resolvedIT : prev);
    
  }, [products, id, isEditingName]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const productsRef = useRef(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  // Sync range to localStorage
  useEffect(() => {
    localStorage.setItem('stornote_detail_range', timeRange);
  }, [timeRange]);

  const fetchData = useCallback(async () => {
    if (!id || id === 'undefined' || !user) return;
    
    // Only show global loading if we don't even have basic product info in context
    const contextProduct = productsRef.current.find(p => p.id === id);
    if (!contextProduct && !product) setLoading(true);

    try {
      // 1. Only fetch Product from DB if missing in Context (e.g. direct link)
      if (!contextProduct && !product) {
        const { data: pData, error: pError } = await supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .single();
        
        if (pError) throw pError;
        if (pData) setProduct(pData);
      }
      
      // Transactions are now handled by TransactionContext
      
    } catch (err) {
      console.error('Error fetching details:', err);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id, product]); // Only depend on identity factors, not the product data itself

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const salesMapByDate = useMemo(() => {
    const up = parseFloat(unitPrice) || 1;
    const map: Record<string, number> = {};
    transactions.forEach(t => {
      if (t.type === 'income') {
        const qtyMatch = t.notes.match(/Qty:(\d+(\.\d+)?)/);
        const count = qtyMatch ? parseFloat(qtyMatch[1]) : (t.amount / up || 0);
        map[t.date] = (map[t.date] || 0) + count;
      }
    });
    return map;
  }, [transactions, unitPrice]);

  const chartData = useMemo(() => {
    const up = parseFloat(unitPrice || '0');
    const cp = parseFloat(costPrice || '0');
    
    // Group transactions by date
    const salesByDate: Record<string, number> = {};
    transactions.forEach(t => {
      if (t.type === 'income') {
        const qtyMatch = t.notes.match(/Qty:(\d+(\.\d+)?)/);
        const count = qtyMatch ? parseFloat(qtyMatch[1]) : (t.amount / up || 0);
        salesByDate[t.date] = (salesByDate[t.date] || 0) + count;
      }
    });

    if (timeRange === '日') {
      const data = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = getShanghaiDateStr(d);
        const monthDayStr = dateStr.split('-').slice(1).map(p => parseInt(p)).join('/');
        
        const count = Math.round(salesByDate[dateStr] || 0);
        data.push({
          name: monthDayStr,
          dateStr: dateStr,
          revenue: count * up,
          profit: count * (up - cp),
          sales: count
        });
      }
      return data;
    } else if (timeRange === '月') {
      const yearData = [];
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonthIndex = now.getMonth();
      
      for (let m = 0; m <= currentMonthIndex; m++) {
        const monthStr = `${currentYear}-${String(m + 1).padStart(2, '0')}`;
        let monthlyCount = 0;
        
        Object.entries(salesByDate).forEach(([date, count]) => {
          if (date.startsWith(monthStr)) {
            monthlyCount += count;
          }
        });

        yearData.push({
          name: `${m + 1}月`,
          revenue: monthlyCount * up,
          profit: monthlyCount * (up - cp),
          sales: Math.round(monthlyCount)
        });
      }
      return yearData;
    } else {
      const yearAgg: Record<string, {sales: number, revenue: number, profit: number}> = {};
      
      Object.entries(salesByDate).forEach(([date, count]) => {
        const year = date.split('-')[0];
        if (!yearAgg[year]) {
          yearAgg[year] = { sales: 0, revenue: 0, profit: 0 };
        }
        yearAgg[year].sales += count;
        yearAgg[year].revenue += count * up;
        yearAgg[year].profit += count * (up - cp);
      });

      const currentYear = new Date().getFullYear().toString();
      if (Object.keys(yearAgg).length === 0) {
        yearAgg[currentYear] = { sales: 0, revenue: 0, profit: 0 };
      }

      return Object.entries(yearAgg)
        .map(([year, data]) => ({
          name: `${year}年`,
          ...data,
          sales: Math.round(data.sales)
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [unitPrice, costPrice, transactions, timeRange]);

  const currentRevenue = useMemo(() => chartData[chartData.length - 1].revenue, [chartData]);
  const currentProfit = useMemo(() => chartData[chartData.length - 1].profit, [chartData]);

  const handleConfirmDelete = async () => {
    if (!user || !id) return;
    setLoading(true);
    try {
      console.log(`[Action] Deleting product ${id}`);
      await deleteProduct(id);
      
      setIsDeleteDialogOpen(false);
      toast.success('产品已成功删除');
      
      // Navigate immediately as context is updated immediately now
      navigate('/inventory', { replace: true });
    } catch (err) {
      console.error('[Delete Error]', err);
      toast.error('删除失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSales = async (newSales: Record<string, number>) => {
    if (!user || !id || !product) return;
    const up = parseFloat(unitPrice) || 0;

    try {
      setLoading(true); // Show local loading during sync
      
      // 1. Fetch current database state for this product's transactions in one go
      const { data: existingTransactions, error: fetchError } = await supabase
        .from('transactions')
        .select('id, date, notes')
        .eq('user_id', user.id)
        .ilike('notes', `%ProdID:${id}%`);

      if (fetchError) throw fetchError;

      const dbMap = new Map<string, { id: string, date: string, notes: string }>(
        existingTransactions.map(t => [t.date, t])
      );
      const operations = [];

      // 2. Identify changes and prepare parallel operations
      for (const [date, count] of Object.entries(newSales)) {
        const amount = count * up;
        const note = `ProdID:${id} Qty:${count}`;
        const existing = dbMap.get(date);

        if (existing) {
          if (count === 0) {
            // Delete if count is now 0
            operations.push(
              supabase
                .from('transactions')
                .delete()
                .eq('id', existing.id)
            );
          } else if (existing.notes !== note) {
            // Update only if data actually changed
            operations.push(
              supabase
                .from('transactions')
                .update({ 
                  amount, 
                  notes: note,
                  updated_at: new Date().toISOString() 
                })
                .eq('id', existing.id)
            );
          }
        } else if (count > 0) {
          // Insert new record
          operations.push(
            supabase
              .from('transactions')
              .insert({
                user_id: user.id,
                date,
                amount,
                type: 'income',
                category: '销售收入',
                notes: note,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
          );
        }
      }

      // 3. Execute all operations in parallel
      if (operations.length > 0) {
        const results = await Promise.all(operations);
        const errors = results.filter(r => r.error);
        if (errors.length > 0) throw errors[0].error;
        toast.success('销量数据已同步到云端');
      } else {
        toast.success('数据已是最新');
      }
      
      fetchTransactions();
      setIsCalendarOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('同步失败');
    } finally {
      setLoading(false);
    }
  };

  const { totalSales } = useMemo(() => {
    const up = parseFloat(unitPrice) || 0;
    let allSales = 0;

    transactions.forEach(t => {
      if (t.type === 'income') {
        // Try to get Qty from notes first (new format), fallback to amount-based (old format)
        const qtyMatch = t.notes.match(/Qty:(\d+(\.\d+)?)/);
        const count = qtyMatch ? parseFloat(qtyMatch[1]) : (t.amount / up || 0);
        
        allSales += count;
      }
    });

    return {
      totalSales: Math.round(allSales)
    };
  }, [transactions, unitPrice]);

  const remainingInventory = Math.max(0, baseInventory - totalSales);
  
  const inventoryStatus = useMemo(() => {
    if (remainingInventory <= 0) return { 
      label: '暂时缺货', 
      color: 'bg-surface-container-highest text-on-surface-variant ring-outline-variant/20',
      barColor: 'bg-outline-variant opacity-30'
    };
    if (remainingInventory <= inventoryThreshold) return { 
      label: `库存紧张 (${remainingInventory})`, 
      color: 'bg-error text-white ring-error shadow-sm shadow-error/20',
      barColor: 'bg-error shadow-[0_0_8px_rgba(255,107,107,0.4)]'
    };
    return { 
      label: '库存充足', 
      color: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
      barColor: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
    };
  }, [remainingInventory, inventoryThreshold]);

  const realTimeProfitMargin = useMemo(() => {
    const up = parseFloat(unitPrice);
    const cp = parseFloat(costPrice);
    if (isNaN(up) || isNaN(cp) || up === 0) return '0.0';
    return (((up - cp) / up) * 100).toFixed(1);
  }, [unitPrice, costPrice]);

  const totalInventoryValue = useMemo(() => {
    const up = parseFloat(unitPrice) || 0;
    return remainingInventory * up;
  }, [remainingInventory, unitPrice]);

  const handleSaveName = async () => {
    if (isSavingNameRef.current) return;

    const trimmedName = (editedName || '').trim();
    if (!user || !id || !trimmedName) {
      setIsEditingName(false);
      return;
    }

    // Capture the name to save so it doesn't change during await if editedName changes
    const nameToSave = trimmedName;
    isSavingNameRef.current = true;

    try {
      await updateProduct(id, { name: nameToSave });
      setProduct(prev => prev ? { ...prev, name: nameToSave } : null);
      setIsEditingName(false);
      toast.success('名称已更新');
    } catch (err) {
      console.error(err);
      toast.error('更新失败');
      setIsEditingName(false);
    } finally {
      isSavingNameRef.current = false;
    }
  };

  const handleSaveMetrics = async () => {
    if (!user || !id || !product) return;
    
    try {
      const updates = {
        price_value: parseFloat(unitPrice) || 0,
        cost_price: parseFloat(costPrice) || 0,
        base_inventory: baseInventory,
        inventory_threshold: inventoryThreshold
      };

      await updateProduct(id, updates);
      setProduct(prev => prev ? { ...prev, ...updates } : null);
      toast.success('指标已更新');
    } catch (err) {
      console.error(err);
      toast.error('保存失败');
    }
  };

  const openCalendar = useCallback(() => setIsCalendarOpen(true), []);
  const closeCalendar = useCallback(() => setIsCalendarOpen(false), []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="w-20 h-20 bg-surface-container rounded-full flex items-center justify-center text-on-surface-variant/20 mb-2">
          <span className="material-symbols-outlined text-5xl">inventory_2</span>
        </div>
        <div>
          <h2 className="text-2xl font-headline font-black text-primary mb-2">未找到该产品</h2>
          <p className="text-on-surface-variant text-sm max-w-xs mx-auto">
            该产品可能已被删除，或者您没有权限访问此页面。
          </p>
        </div>
        <button 
          onClick={() => navigate('/inventory')} 
          className="px-8 py-3 bg-primary text-white rounded-full font-bold hover:shadow-lg transition-all active:scale-95 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          返回库存列表
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Product Header Section */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex-grow max-w-2xl">
            {isEditingName ? (
              <div className="flex items-center gap-3">
                <input 
                  autoFocus
                  className="text-3xl md:text-4xl font-headline font-black text-primary tracking-tight leading-tight bg-surface-container-low border-b-2 border-primary outline-none px-2 py-1 w-full"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  onBlur={handleSaveName}
                />
                <button 
                  onClick={handleSaveName}
                  className="w-10 h-10 flex items-center justify-center bg-primary text-white rounded-full shadow-lg hover:scale-110 active:scale-95 transition-all shrink-0"
                >
                  <span className="material-symbols-outlined text-xl">check</span>
                </button>
              </div>
            ) : (
              <div className="group flex items-center gap-4">
                <h2 className="text-4xl md:text-5xl font-headline font-black text-primary tracking-tight leading-tight">
                  {product.name || '（未命名产品）'}
                </h2>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setIsEditingName(true)}
                    className="p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container rounded-full transition-all"
                    title="修改名称"
                  >
                    <span className="material-symbols-outlined text-xl">edit</span>
                  </button>
                  <button 
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container/10 rounded-full transition-all"
                    title="删除此产品"
                  >
                    <span className="material-symbols-outlined text-xl">delete</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="flex bg-surface-container-low p-1.5 rounded-xl border border-surface-container-highest self-start md:self-auto">
            {(['日', '月', '年'] as const).map((range) => (
              <button 
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  "px-5 py-1.5 text-xs font-bold uppercase tracking-tight transition-all rounded-lg",
                  timeRange === range 
                    ? "text-primary bg-white shadow-sm" 
                    : "text-on-surface-variant hover:text-primary"
                )}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Analytics Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Main Chart Card */}
        <div className="lg:col-span-8">
          {transactionsLoading ? (
            <div className="w-full h-[400px] bg-white rounded-2xl border border-surface-container-high shadow-sm flex flex-col items-center justify-center gap-4 animate-pulse">
              <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
              <p className="text-on-surface-variant text-xs font-bold tracking-widest uppercase">计算财务趋势...</p>
            </div>
          ) : (
            <FinancialChart 
              data={chartData} 
              currentRevenue={currentRevenue} 
              currentProfit={currentProfit} 
              onOpenCalendar={openCalendar} 
            />
          )}
        </div>

        {/* KPI Cards */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="flex flex-col gap-6">
            <div className="bg-white p-5 rounded-2xl border border-surface-container-high shadow-sm shadow-black/5 flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-primary/10 transition-colors"></div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-5 bg-primary rounded-full"></div>
                  <span className="text-sm font-black text-on-surface-variant uppercase tracking-normal">总库存价值</span>
                </div>
                
                <div className="relative z-10">
                  {transactionsLoading ? (
                    <div className="h-10 w-32 bg-surface-container rounded-lg animate-pulse"></div>
                  ) : (
                    <div className="text-4xl font-headline font-black text-primary tracking-tighter leading-none">
                      ¥{totalInventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-surface-container-low">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest opacity-60">库存健康度</span>
                  <span className={cn(
                    "px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter shadow-sm ring-1",
                    inventoryStatus.color
                  )}>
                    {inventoryStatus.label}
                  </span>
                </div>
                <div className="w-full h-2 bg-surface-container-low rounded-full overflow-hidden shadow-inner">
                  <div 
                    className={cn("h-full transition-all duration-700 rounded-full", inventoryStatus.barColor)} 
                    style={{ width: `${Math.min(100, (remainingInventory / (baseInventory || 1)) * 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Inventory & Price Controls Section */}
      <section className="bg-white rounded-2xl border border-surface-container-high shadow-sm overflow-hidden">
        <div className="py-3 px-6 border-b border-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-xl">tune</span>
            </div>
            <h3 className="font-headline font-bold text-primary text-lg">库存与价格动态控制</h3>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden md:block text-[10px] font-bold text-outline-variant uppercase">最后编辑于 10:45 AM</span>
          </div>
        </div>
        <div className="py-2 px-5 max-w-4xl mx-auto w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 mb-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-outline-variant uppercase tracking-widest flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px]">inventory</span>
                基础库存量 (件)
              </label>
              <div className="flex items-center gap-3">
                <div className="group relative flex-1">
                  <input 
                    className="w-full bg-surface-container-low border-b-2 border-transparent focus:border-primary focus:bg-white focus:ring-0 text-primary font-headline font-bold text-xl py-1 px-1 transition-all" 
                    type="number" 
                    min="0"
                    step="1"
                    value={baseInventory}
                    onChange={(e) => setBaseInventory(Math.max(0, Math.floor(Number(e.target.value))))}
                  />
                  <div className="absolute bottom-0 left-0 w-full h-[1px] bg-surface-container-highest"></div>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => setBaseInventory(prev => prev + 1)}
                    className="p-1 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all"
                    title="增加库存"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                  </button>
                  <button 
                    onClick={() => setBaseInventory(prev => Math.max(0, prev - 1))}
                    className="p-1 bg-error/10 text-error rounded-lg hover:bg-error hover:text-white transition-all"
                    title="减少库存"
                  >
                    <span className="material-symbols-outlined text-sm">remove</span>
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-on-surface-variant/60">当前剩余库存: {remainingInventory} (已扣除总销量 {totalSales})</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-outline-variant uppercase tracking-widest flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px]">sell</span>
                单价 (¥)
              </label>
              <div className="group relative">
                <input 
                  className="w-full bg-surface-container-low border-b-2 border-transparent focus:border-primary focus:bg-white focus:ring-0 text-primary font-headline font-bold text-xl py-1 px-1 transition-all" 
                  type="number" 
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                />
                <div className="absolute bottom-0 left-0 w-full h-[1px] bg-surface-container-highest"></div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-outline-variant uppercase tracking-widest flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px]">payments</span>
                成本价 (¥)
              </label>
              <div className="group relative">
                <input 
                  className="w-full bg-surface-container-low border-b-2 border-transparent focus:border-primary focus:bg-white focus:ring-0 text-primary font-headline font-bold text-xl py-1 px-1 transition-all" 
                  type="number" 
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                />
                <div className="absolute bottom-0 left-0 w-full h-[1px] bg-surface-container-highest"></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-3 border-t border-surface-container-low">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-primary/60 uppercase tracking-widest flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px]">tune</span>
                库存预警阈值
              </label>
              <div className="group relative">
                <input 
                  className="w-full bg-surface-container-low border-b-2 border-transparent focus:border-primary focus:bg-white focus:ring-0 text-primary font-headline font-bold text-xl py-1 px-1 transition-all" 
                  type="number" 
                  min="0"
                  value={inventoryThreshold}
                  onChange={(e) => setInventoryThreshold(Math.max(0, Math.floor(Number(e.target.value))))}
                />
                <div className="absolute bottom-0 left-0 w-full h-[1px] bg-surface-container-highest"></div>
              </div>
              <p className="text-[10px] text-on-surface-variant/60">剩余库存 ≤ 此值时显示“库存紧张”</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-primary/60 uppercase tracking-widest flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px]">percent</span>
                实时利润率
              </label>
              <div className="bg-primary/5 rounded-lg p-1.5 flex items-end justify-between border border-primary/10 h-[40px]">
                <span className="text-primary font-headline font-black text-2xl leading-none">
                  {realTimeProfitMargin}
                </span>
                <span className="text-primary/40 font-bold text-sm">%</span>
              </div>
            </div>
            <div className="flex items-end">
              <button 
                onClick={handleSaveMetrics}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">save</span>
                保存库存与价格修改
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        productName={product.name}
      />

      {/* Sales Calendar Modal */}
      <SalesCalendarModal 
        isOpen={isCalendarOpen}
        onClose={closeCalendar}
        initialSales={salesMapByDate}
        onSave={handleSaveSales}
      />
    </div>
  );
}
