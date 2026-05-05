import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useTransactions } from './TransactionContext';
import toast from 'react-hot-toast';

export interface Product {
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
  created_at?: string;
  updated_at?: string;
}

interface ProductContextType {
  products: Product[];
  loading: boolean;
  addProduct: (product: Omit<Product, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<Product | void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export function ProductProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { optimisticDeleteByProductId, fetchTransactions } = useTransactions();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const deletedIdsRef = React.useRef<Set<string>>(new Set());

  // Persistent blacklist for items that should NEVER be shown
  const getPersistentBlacklist = (): Set<string> => {
    try {
      const saved = localStorage.getItem('stornote_permanently_deleted');
      return new Set(saved ? JSON.parse(saved) : []);
    } catch {
      return new Set();
    }
  };

  const saveToPersistentBlacklist = (id: string) => {
    try {
      const list = Array.from(getPersistentBlacklist());
      if (!list.includes(id)) {
        list.push(id);
        localStorage.setItem('stornote_permanently_deleted', JSON.stringify(list));
      }
      deletedIdsRef.current.add(id);
    } catch (e) {
      console.error('Failed to save to blacklist', e);
    }
  };

  const fetchProducts = async () => {
    if (!user) return;
    setLoading(true);
    console.log('[ProductContext] Fetching products from DB...');
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', '已彻底删除') // Global filter: ignore soft-deleted items
        .order('name', { ascending: true });

      if (error) throw error;
      
      const blacklist = getPersistentBlacklist();
      const enrichedData = (data || []).filter(p => !blacklist.has(p.id) && !deletedIdsRef.current.has(p.id));
      
      console.log(`[ProductContext] Fetched ${enrichedData.length} products`);
      setProducts(enrichedData);
    } catch (error) {
      console.error('[ProductContext] Error fetching products:', error);
      handleSupabaseError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchProducts();
      
      console.log('[ProductContext] Setting up real-time channel for user:', user.id);
      const channel = supabase
        .channel(`public:products:user:${user.id}`)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'products'
        }, (payload) => {
          console.log('[Realtime] Product event received:', payload.eventType, payload);
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const data = payload.new as Product;
            if (!data) return;

            if (payload.eventType === 'INSERT') {
              const blacklist = getPersistentBlacklist();
              if (blacklist.has(data.id) || deletedIdsRef.current.has(data.id)) {
                console.log('[Realtime] Ignoring INSERT: item locally deleted');
                return;
              }
              
              setProducts(prev => {
                if (prev.some(p => p.id === data.id)) return prev;
                console.log('[Realtime] Sync ADD:', data.name);
                return [...prev, data].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
              });
            } else if (payload.eventType === 'UPDATE') {
              const blacklist = getPersistentBlacklist();
              
              // Handle soft-delete status
              if (data.status === '已彻底删除' || blacklist.has(data.id) || deletedIdsRef.current.has(data.id)) {
                console.log('[Realtime] Sync REMOVE (soft-deleted):', data.id);
                setProducts(prev => prev.filter(p => p.id !== data.id));
                return;
              }

              setProducts(prev => {
                const exists = prev.some(p => p.id === data.id);
                if (!exists) {
                   console.log('[Realtime] Sync APPEAR (newly visible):', data.name);
                   return [...prev, data].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                }
                console.log('[Realtime] Sync UPDATE:', data.name);
                return prev.map(p => p.id === data.id ? { ...p, ...data } : p);
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id;
            if (deletedId) {
              console.log('[Realtime] Sync DELETE:', deletedId);
              setProducts(prev => prev.filter(p => p.id !== deletedId));
            }
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[Realtime] Subscribed to products');
          }
        });

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setProducts([]);
      setLoading(false);
    }
  }, [user?.id]); // Use user.id as dependency for more stability

  const addProduct = async (p: Omit<Product, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<Product | void> => {
    if (!user) return;
    try {
      console.log('[ProductContext] Adding product:', p.name);
      const { name, sku, price_value, cost_price, base_inventory, inventory_threshold, status, status_color, is_out_of_stock } = p;
      const { error, data: rawData } = await supabase
        .from('products')
        .insert({
          name: name.trim(), 
          sku, 
          price_value: Number(price_value) || 0,
          cost_price: Number(cost_price) || 0,
          base_inventory: Number(base_inventory) || 0,
          inventory_threshold: Number(inventory_threshold) || 5,
          status, 
          status_color, 
          is_out_of_stock,
          user_id: user.id
        })
        .select();

      if (error) {
        console.error('[Supabase Insert Error Detail]', error);
        throw error;
      }
      
      // Defensively extract data - handle both object and array response formats
      const data = Array.isArray(rawData) ? rawData[0] : rawData;

      if (data && data.id) {
        console.log('[ProductContext] Product added successfully, ID resolved:', data.id);
        
        // Optimistic state update
        setProducts(prev => {
          const exists = prev.some(item => item.id === data.id);
          if (exists) return prev;
          return [data, ...prev].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        });

        return data;
      } else {
        console.warn('[ProductContext] Product insertion returned empty or invalid ID data:', rawData);
      }
    } catch (error) {
      handleSupabaseError(error);
      throw error; 
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    if (!user) return;
    try {
      console.log(`[ProductContext] Updating product ${id}:`, updates);
      
      const allowedFields = [
        'name', 'sku', 'price_value', 'cost_price', 
        'base_inventory', 'inventory_threshold', 
        'status', 'status_color', 'is_out_of_stock'
      ];
      
      const dbUpdates: any = {
        updated_at: new Date().toISOString()
      };
      
      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) {
          // Normalize numbers for DB
          if (['price_value', 'cost_price', 'base_inventory', 'inventory_threshold'].includes(key)) {
            dbUpdates[key] = Number((updates as any)[key]) || 0;
          } else {
            dbUpdates[key] = (updates as any)[key];
          }
        }
      });

      if (Object.keys(dbUpdates).length > 1) {
        const { error } = await supabase
          .from('products')
          .update(dbUpdates)
          .eq('id', id)
          .eq('user_id', user.id);

        if (error) {
          console.error('[ProductContext] DB Update failed:', error);
          throw error;
        }
      }

      // Optimistic update
      setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  };

  const deleteProduct = async (id: string) => {
    if (!user) return;
    const cleanId = id.trim();
    
    try {
      console.log(`[ProductContext] Optimistic delete for ID: ${cleanId}`);
      
      // 1. Instant UI update - No waiting
      saveToPersistentBlacklist(cleanId);
      setProducts(prev => prev.filter(p => p.id !== cleanId));
      optimisticDeleteByProductId(cleanId);
      
      // 2. Perform deletions in parallel
      const [txResult, prodResult] = await Promise.all([
        supabase
          .from('transactions')
          .delete()
          .eq('user_id', user.id)
          .ilike('notes', `%ProdID:${cleanId}%`),
        supabase
          .from('products')
          .delete({ count: 'exact' })
          .eq('id', cleanId)
      ]);

      if (prodResult.error) throw prodResult.error;

      // Ensure full sync for transactions
      fetchTransactions();

      // 3. Local cleanup
      localStorage.removeItem(`stornote_meta_${cleanId}`);
      Object.keys(localStorage).forEach(key => {
        if (key.includes(cleanId)) localStorage.removeItem(key);
      });

      if (prodResult.count === 0) {
        // Fallback for RLS/Soft-delete if hard delete affected 0 rows
        await supabase
          .from('products')
          .update({ status: '已彻底删除' })
          .eq('id', cleanId)
          .eq('user_id', user.id);
      }
      
    } catch (error) {
      console.error('[ProductContext] Background delete failed:', error);
      await fetchProducts(); 
      handleSupabaseError(error);
      throw error; 
    } finally {
      setTimeout(() => deletedIdsRef.current.delete(cleanId), 20000);
    }
  };

  return (
    <ProductContext.Provider value={{ products, loading, addProduct, updateProduct, deleteProduct }}>
      {children}
    </ProductContext.Provider>
  );
}

export function useProducts() {
  const context = useContext(ProductContext);
  if (context === undefined) {
    throw new Error('useProducts must be used within a ProductProvider');
  }
  return context;
}
