import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { useAuth } from './AuthContext';

export interface Transaction {
  id: string;
  user_id: string;
  date: string;
  category: string;
  notes: string;
  amount: number;
  type: 'expense' | 'income';
  created_at?: string;
  updated_at?: string;
}

interface TransactionContextType {
  transactions: Transaction[];
  loading: boolean;
  deleteTransaction: (id: string) => Promise<void>;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>;
  fetchTransactions: () => Promise<void>;
  optimisticDeleteByProductId: (productId: string) => void;
}

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

export function TransactionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    // Add a safety timeout to prevent permanent loading state
    const timeoutId = setTimeout(() => setLoading(false), 10000);

    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(2000);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      // Fail gracefully
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const addTransaction = async (tr: Omit<Transaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('transactions')
        .insert({
          ...tr,
          user_id: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      await fetchTransactions();
    } catch (error) {
      handleSupabaseError(error);
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
      setTransactions(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      handleSupabaseError(error);
    }
  };

  const optimisticDeleteByProductId = (productId: string) => {
    console.log(`[TransactionContext] Optimistic delete for product: ${productId}`);
    setTransactions(prev => prev.filter(t => !t.notes.includes(`ProdID:${productId}`)));
  };

  useEffect(() => {
    if (user) {
      fetchTransactions();
      
      // Real-time subscription
      const channel = supabase
        .channel(`public:transactions:user:${user.id}`)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'transactions'
        }, (payload) => {
          console.log('[Realtime] Transaction event received:', payload.eventType, payload.new?.id || payload.old?.id);
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const data = payload.new as Transaction;
            
            // Safety check
            if (data.user_id && data.user_id !== user.id) {
              console.log('[Realtime] Ignoring transaction event for different user');
              return;
            }

            if (payload.eventType === 'INSERT') {
              setTransactions(prev => {
                if (prev.some(t => t.id === data.id)) return prev;
                console.log('[Realtime] Adding new transaction via sync:', data.id);
                return [data, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              });
            } else if (payload.eventType === 'UPDATE') {
              console.log('[Realtime] Updating transaction via sync:', data.id);
              setTransactions(prev => prev.map(t => t.id === data.id ? data : t)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              );
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            if (deletedId) {
              console.log('[Realtime] Syncing transaction deletion:', deletedId);
              setTransactions(prev => prev.filter(t => t.id !== deletedId));
            }
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      setTransactions([]);
      setLoading(false);
    }
  }, [user]);

  return (
    <TransactionContext.Provider value={{ 
      transactions, 
      loading, 
      deleteTransaction, 
      addTransaction, 
      fetchTransactions,
      optimisticDeleteByProductId 
    }}>
      {children}
    </TransactionContext.Provider>
  );
}

export function useTransactions() {
  const context = useContext(TransactionContext);
  if (context === undefined) {
    throw new Error('useTransactions must be used within a TransactionProvider');
  }
  return context;
}
