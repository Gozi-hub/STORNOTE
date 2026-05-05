import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { cn, getShanghaiDateStr } from '@/src/lib/utils';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';
import { useProducts } from '../contexts/ProductContext';
import { useTransactions } from '../contexts/TransactionContext';
import toast from 'react-hot-toast';

export default function Inventory() {
  const { user } = useAuth();
  const { products, loading: productsLoading, addProduct } = useProducts();
  const { transactions, loading: transactionsLoading } = useTransactions();
  const loading = productsLoading || transactionsLoading;

  const [sortBy, setSortBy] = useState<'sales' | 'revenue' | 'profit'>(() => {
    return (localStorage.getItem('stornote_inventory_sortBy') as any) || 'sales';
  });
  const [timeRange, setTimeRange] = useState<'day' | 'month' | 'year'>(() => {
    return (localStorage.getItem('stornote_inventory_timeRange') as any) || 'day';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    costPrice: '',
    baseInventory: '',
    status: '充足库存'
  });

  // Persist sortBy and timeRange locally for UI state
  useEffect(() => {
    localStorage.setItem('stornote_inventory_sortBy', sortBy);
  }, [sortBy]);

  useEffect(() => {
    localStorage.setItem('stornote_inventory_timeRange', timeRange);
  }, [timeRange]);

  // Optimize transaction lookup
  const productMetricsMap = useMemo(() => {
    const todayStr = getShanghaiDateStr(new Date());
    const monthStr = todayStr.substring(0, 7);
    const yearStr = todayStr.substring(0, 4);

    const metrics: Record<string, { sales: number; revenue: number; profit: number }> = {};
    
    // Group transactions by product AND time period in a single pass
    const groupedData: Record<string, { day: number; month: number; year: number; dayQty: number; monthQty: number; yearQty: number }> = {};
    
    transactions.forEach(t => {
      if (t.type !== 'income' || !t.notes) return;
      
      const match = t.notes.match(/ProdID:([a-zA-Z0-9_-]+)/);
      if (!match) return;
      const pId = match[1];

      const product = products.find(p => p.id === pId);
      if (!product) return;

      if (!groupedData[pId]) groupedData[pId] = { day: 0, month: 0, year: 0, dayQty: 0, monthQty: 0, yearQty: 0 };
      
      const amount = t.amount || 0;
      const qtyMatch = t.notes.match(/Qty:(\d+(\.\d+)?)/);
      // Determine quantity for this specific transaction
      const qty = qtyMatch ? parseFloat(qtyMatch[1]) : (amount / (product.price_value || 1));

      if (t.date === todayStr) {
        groupedData[pId].day += amount;
        groupedData[pId].dayQty += qty;
      }
      if (t.date.startsWith(monthStr)) {
        groupedData[pId].month += amount;
        groupedData[pId].monthQty += qty;
      }
      if (t.date.startsWith(yearStr)) {
        groupedData[pId].year += amount;
        groupedData[pId].yearQty += qty;
      }
    });

    products.forEach(product => {
      const pData = groupedData[product.id] || { day: 0, month: 0, year: 0, dayQty: 0, monthQty: 0, yearQty: 0 };
      const costPrice = product.cost_price ?? (product.price_value * 0.7);
      
      const calcMet = (revenue: number, totalQty: number) => {
        const sales = totalQty;
        const profit = revenue - (sales * costPrice);
        return { sales, revenue, profit };
      };

      metrics[`${product.id}_day`] = calcMet(pData.day, pData.dayQty);
      metrics[`${product.id}_month`] = calcMet(pData.month, pData.monthQty);
      metrics[`${product.id}_year`] = calcMet(pData.year, pData.yearQty);
    });

    return metrics;
  }, [products, transactions]);

  const getMetricValue = useCallback((product: any, type: 'sales' | 'revenue' | 'profit', range: 'day' | 'month' | 'year') => {
    const m = productMetricsMap[`${product.id}_${range}`];
    return m ? m[type] : 0;
  }, [productMetricsMap]);

  const handleExport = () => {
    const rangeLabel = timeRange === 'day' ? '当日' : timeRange === 'month' ? '当月' : '今年';
    const exportData = filteredAndSortedProducts.map(p => {
      const currentSales = getMetricValue(p, 'sales', timeRange);
      const currentRevenue = getMetricValue(p, 'revenue', timeRange);
      const currentProfit = getMetricValue(p, 'profit', timeRange);

      return {
        '产品名称': p.name,
        '库存状态': p.status,
        '单价 (¥)': p.price_value,
        '成本价 (¥)': p.cost_price || 0,
        [`${rangeLabel}销量`]: Math.round(currentSales),
        [`${rangeLabel}收入 (¥)`]: currentRevenue.toFixed(2),
        [`${rangeLabel}利润 (¥)`]: currentProfit.toFixed(2),
        '是否缺货': (p.is_out_of_stock || false) ? '是' : '否'
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "库存数据");
    ws['!cols'] = [{ wch: 35 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 10 }];
    XLSX.writeFile(wb, `库存分析_${rangeLabel}_按${sortBy === 'sales' ? '销量' : sortBy === 'revenue' ? '收入' : '利润'}排序_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filteredAndSortedProducts = useMemo(() => {
    // Ensure unique products by ID to prevent key warnings
    const uniqueMap = new Map();
    products.forEach(p => {
      if (p.id) uniqueMap.set(p.id, p);
    });
    const uniqueProducts = Array.from(uniqueMap.values());

    return uniqueProducts
      .filter(p => (p.name || '').toLowerCase().includes((searchQuery || '').toLowerCase()))
      .sort((a, b) => {
        const valA = getMetricValue(a, sortBy, timeRange);
        const valB = getMetricValue(b, sortBy, timeRange);
        
        // Use a small epsilon for floating point comparison if needed, though mostly integers here
        if (Math.abs(valB - valA) < 0.001) {
          const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return timeB - timeA;
        }
        return valB - valA;
      });
  }, [products, searchQuery, sortBy, timeRange, getMetricValue]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedProducts.length / itemsPerPage));
  
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedProducts = filteredAndSortedProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSubmitting) return;
    
    if (!newProduct.name.trim()) {
      toast.error('请输入产品名称');
      return;
    }
    
    const priceVal = parseFloat(newProduct.price);
    if (isNaN(priceVal) || priceVal < 0) {
      toast.error('请设置有效的销售单价');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const createdProduct = await addProduct({
        name: newProduct.name,
        sku: `SKU-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        status: newProduct.status,
        status_color: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
        price_value: priceVal,
        is_out_of_stock: false,
        cost_price: parseFloat(newProduct.costPrice) || 0,
        base_inventory: parseInt(newProduct.baseInventory) || 0,
        inventory_threshold: 20
      });

      setIsAddModalOpen(false);
      setNewProduct({ name: '', price: '', costPrice: '', baseInventory: '', status: '充足库存' });
      toast.success('产品添加成功');
      setCurrentPage(1);
    } catch (err) {
      console.error('Error adding product:', err);
      toast.error('添加产品失败，请检查网络或重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filter */}
      <section className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-grow group">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary-container transition-colors text-lg">search</span>
          <input 
            className="w-full pl-11 pr-4 py-2.5 bg-white border border-outline-variant/20 rounded-xl text-sm focus:ring-4 focus:ring-primary-container/5 focus:border-primary-container transition-all outline-none shadow-sm" 
            placeholder="搜索产品名称..." 
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        <div className="flex gap-2 items-stretch">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-outline-variant/20 rounded-xl text-xs font-semibold text-on-surface hover:bg-surface-container transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-lg">download</span>
            导出
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2 bg-primary-container text-white rounded-xl text-xs font-bold hover:shadow-lg hover:shadow-primary-container/20 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            新增产品
          </button>
        </div>
      </section>

      {/* Sorting & Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center px-1 gap-3">
        <h2 className="font-headline font-black text-lg text-primary-container">实时库存清单</h2>
        
        <div className="flex flex-wrap items-center gap-4">
          {/* Time Range Selector */}
          <div className="flex bg-surface-container-low p-1 rounded-xl border border-surface-container-highest shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]">
            <button 
              onClick={() => setTimeRange('day')}
              className={cn(
                "px-4 py-1.5 text-xs font-black rounded-lg",
                timeRange === 'day' ? "bg-white text-primary-container shadow-sm ring-1 ring-black/5" : "text-on-surface-variant hover:text-primary-container transition-colors"
              )}
            >
              日
            </button>
            <button 
              onClick={() => setTimeRange('month')}
              className={cn(
                "px-4 py-1.5 text-xs font-black rounded-lg",
                timeRange === 'month' ? "bg-white text-primary-container shadow-sm ring-1 ring-black/5" : "text-on-surface-variant hover:text-primary-container transition-colors"
              )}
            >
              月
            </button>
            <button 
              onClick={() => setTimeRange('year')}
              className={cn(
                "px-4 py-1.5 text-xs font-black rounded-lg",
                timeRange === 'year' ? "bg-white text-primary-container shadow-sm ring-1 ring-black/5" : "text-on-surface-variant hover:text-primary-container transition-colors"
              )}
            >
              年
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex bg-surface-container-low p-1 rounded-xl border border-surface-container-highest shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]">
            <button 
              onClick={() => setSortBy('sales')}
              className={cn(
                "px-4 py-1.5 text-xs font-black rounded-lg",
                sortBy === 'sales' ? "bg-white text-primary-container shadow-sm ring-1 ring-black/5" : "text-on-surface-variant hover:text-primary-container transition-colors"
              )}
            >
              按销量
            </button>
            <button 
              onClick={() => setSortBy('revenue')}
              className={cn(
                "px-4 py-1.5 text-xs font-black rounded-lg",
                sortBy === 'revenue' ? "bg-white text-primary-container shadow-sm ring-1 ring-black/5" : "text-on-surface-variant hover:text-primary-container transition-colors"
              )}
            >
              按收入
            </button>
            <button 
              onClick={() => setSortBy('profit')}
              className={cn(
                "px-4 py-1.5 text-xs font-black rounded-lg",
                sortBy === 'profit' ? "bg-white text-primary-container shadow-sm ring-1 ring-black/5" : "text-on-surface-variant hover:text-primary-container transition-colors"
              )}
            >
              按利润
            </button>
          </div>
        </div>
      </div>

      {/* Product List */}
      <div className="space-y-2">
        {filteredAndSortedProducts.length === 0 ? (
          <div key="empty-state" className="bg-white p-12 rounded-2xl border border-dashed border-outline-variant/30 text-center">
            <p className="text-on-surface-variant text-sm">未找到匹配的产品</p>
          </div>
        ) : (
          paginatedProducts.map((product) => {
            const displayVal = getMetricValue(product, sortBy, timeRange);
            
            const getDisplayString = () => {
              if (sortBy === 'sales') return Math.round(displayVal).toLocaleString();
              return `¥${displayVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            };

            const getMetricLabel = () => {
              const rangeLabel = timeRange === 'day' ? '当日' : timeRange === 'month' ? '当月' : '今年';
              const typeLabel = sortBy === 'sales' ? '销量' : sortBy === 'revenue' ? '收入' : '利润';
              return `${rangeLabel}${typeLabel}`;
            };

            return (
              <Link 
                key={product.id}
                to={`/inventory/${product.id}`}
                className={cn(
                  "bg-white px-4 py-3 rounded-xl shadow-sm border border-outline-variant/10 hover:border-primary-container/30 transition-shadow hover:shadow-md group flex items-start justify-between gap-4",
                  product.is_out_of_stock && "opacity-80"
                )}
              >
                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={cn(
                      "font-black text-base text-primary tracking-tight line-clamp-2 leading-tight",
                      product.is_out_of_stock && "text-on-surface-variant"
                    )}>
                      {product.name}
                    </h3>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-md text-[8px] font-black ring-1 uppercase tracking-tighter shrink-0",
                      product.status_color
                    )}>
                      {product.status}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0 pl-4 border-l border-outline-variant/5 min-w-[90px] md:min-w-[140px] justify-center self-stretch">
                  <span className="text-[9px] text-primary-container/40 font-black uppercase tracking-wider whitespace-nowrap">{getMetricLabel()}</span>
                  <span className="font-headline font-black text-base text-primary-container leading-none tabular-nums text-right">
                    {getDisplayString()}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 py-4 px-1 border-t border-outline-variant/10">
          <span className="text-[10px] text-on-surface-variant/70 font-black uppercase tracking-widest">
            共 {filteredAndSortedProducts.length} 个产品
          </span>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-outline-variant/20 hover:bg-surface-container transition-all disabled:opacity-30 shadow-sm"
            >
              <span className="material-symbols-outlined text-xs">chevron_left</span>
            </button>
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={cn(
                  "w-7 h-7 flex items-center justify-center rounded-lg text-[10px] font-black transition-all",
                  currentPage === page 
                    ? "bg-primary-container text-white shadow-sm" 
                    : "bg-white border border-outline-variant/20 hover:bg-surface-container text-on-surface"
                )}
              >
                {page}
              </button>
            ))}

            <button 
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-outline-variant/20 hover:bg-surface-container transition-all disabled:opacity-30 shadow-sm"
            >
              <span className="material-symbols-outlined text-xs">chevron_right</span>
            </button>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-outline-variant/10 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center">
              <h3 className="text-xl font-black text-primary">新增产品</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-surface-container rounded-full transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleAddProduct} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">产品名称</label>
                <input 
                  required
                  className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl outline-none focus:border-primary transition-all"
                  placeholder="请输入产品名称"
                  value={newProduct.name}
                  onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">单价 (¥)</label>
                  <input 
                    required
                    type="number"
                    step="0.01"
                    className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl outline-none focus:border-primary transition-all text-sm"
                    placeholder="0.00"
                    value={newProduct.price}
                    onChange={e => setNewProduct({...newProduct, price: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">成本价 (¥)</label>
                  <input 
                    type="number"
                    step="0.01"
                    className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl outline-none focus:border-primary transition-all text-sm"
                    placeholder="0.00"
                    value={newProduct.costPrice}
                    onChange={e => setNewProduct({...newProduct, costPrice: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">初始库存量 (件)</label>
                <input 
                  type="number"
                  className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/20 rounded-xl outline-none focus:border-primary transition-all text-sm"
                  placeholder="0"
                  value={newProduct.baseInventory}
                  onChange={e => setNewProduct({...newProduct, baseInventory: e.target.value})}
                />
              </div>
              <div className="pt-4">
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 bg-primary-container text-white rounded-2xl font-bold hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      正在添加...
                    </>
                  ) : (
                    '确认添加'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
