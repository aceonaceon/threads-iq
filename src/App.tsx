import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Analyze from './pages/Analyze';
import Report from './pages/Report';
import History from './pages/History';
import Login from './pages/Login';
import { AuthProvider } from './lib/auth';

export default function App() {
  return (
    <AuthProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/analyze" element={<Analyze />} />
          <Route path="/report/:id" element={<Report />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </Layout>
    </AuthProvider>
  );
}
