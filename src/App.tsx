/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import ProductDetail from './pages/ProductDetail';
import Transactions from './pages/Transactions';
import Reports from './pages/Reports';
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import AdminApproval from './pages/AdminApproval';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TransactionProvider } from './contexts/TransactionContext';
import { ProductProvider } from './contexts/ProductContext';

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) {
  const { user, loading, isAdmin } = useAuth();
  
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
  
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-center" reverseOrder={false} />
      <TransactionProvider>
        <ProductProvider>
          <Router>
            <Routes>
              {/* Auth Routes */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protected Routes */}
            <Route path="/dashboard" element={<ProtectedRoute><Layout title="运营控制面板"><Dashboard /></Layout></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute><Layout title="实时库存清单"><Inventory /></Layout></ProtectedRoute>} />
            <Route path="/inventory/:id" element={<ProtectedRoute><Layout title="产品详情" showBack><ProductDetail /></Layout></ProtectedRoute>} />
            <Route path="/transactions" element={<ProtectedRoute><Layout title="财务记录"><Transactions /></Layout></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Layout title="财务分析报告"><Reports /></Layout></ProtectedRoute>} />
            <Route path="/admin/approval" element={<ProtectedRoute adminOnly><Layout title="账号审批"><AdminApproval /></Layout></ProtectedRoute>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Router>
      </ProductProvider>
    </TransactionProvider>
  </AuthProvider>
);
}
