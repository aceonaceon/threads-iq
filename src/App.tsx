import { Routes, Route, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Analyze from './pages/Analyze';
import Report from './pages/Report';
import History from './pages/History';
import Login from './pages/Login';
import Affiliate from './pages/Affiliate';
import ThreadGenerator from './pages/ThreadGenerator';
import DraftCheck from './pages/DraftCheck';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import Admin from './pages/Admin';
import { AuthProvider, useAuth } from './lib/auth';

// Auth success handler component
function AuthSuccessHandler() {
  const { checkAuth, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading) {
      checkAuth().then(() => {
        navigate('/analyze');
      });
    }
  }, [isLoading, checkAuth, navigate]);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400">正在完成登入...</p>
      </div>
    </div>
  );
}

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/success" element={<AuthSuccessHandler />} />
      <Route path="/auth/callback" element={<AuthSuccessHandler />} />
      {/* Public blog routes - no auth required */}
      <Route path="/blog" element={<Blog />} />
      <Route path="/blog/:slug" element={<BlogPost />} />
      {/* Protected routes */}
      <Route 
        path="/analyze" 
        element={
          <ProtectedRoute>
            <Analyze />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/report/:id" 
        element={
          <ProtectedRoute>
            <Report />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/history" 
        element={
          <ProtectedRoute>
            <History />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/affiliate" 
        element={
          <ProtectedRoute>
            <Affiliate />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/thread-generator" 
        element={
          <ProtectedRoute>
            <ThreadGenerator />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/draft-check" 
        element={
          <ProtectedRoute>
            <DraftCheck />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/admin" 
        element={
          <ProtectedRoute>
            <Admin />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Layout>
        <AppRoutes />
      </Layout>
    </AuthProvider>
  );
}
