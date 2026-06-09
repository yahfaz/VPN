import { Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Servers } from './pages/Servers';
import { Features } from './pages/Features';
import { Statistics } from './pages/Statistics';
import { Settings } from './pages/Settings';

export function App() {
  return (
    <div className="flex h-screen overflow-hidden bg-navy-950">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/servers" element={<Servers />} />
          <Route path="/features" element={<Features />} />
          <Route path="/stats" element={<Statistics />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
