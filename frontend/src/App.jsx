import { Routes, Route, NavLink } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ConfigProvider } from './hooks/useConfig.js';
import ApplicantForm from './pages/ApplicantForm.jsx';
import RuleConfig from './pages/RuleConfig.jsx';
import Result from './pages/Result.jsx';
import Portfolio from './pages/Portfolio.jsx';

const navLinkClass = ({ isActive }) =>
  `px-3 py-2 rounded-lg text-sm font-medium transition ${
    isActive ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
  }`;

export default function App() {
  return (
    <ConfigProvider>
      <Toaster position="top-right" toastOptions={{ duration: 5000 }} />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white grid place-items-center font-bold">₹</span>
            <span className="font-semibold text-slate-800">Micro-Credit Approval Engine</span>
          </div>
          <nav className="flex items-center gap-1 ml-auto">
            <NavLink to="/" end className={navLinkClass}>Applicant</NavLink>
            <NavLink to="/config" className={navLinkClass}>Rule Config</NavLink>
            <NavLink to="/portfolio" className={navLinkClass}>Portfolio</NavLink>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<ApplicantForm />} />
          <Route path="/config" element={<RuleConfig />} />
          <Route path="/result/:id" element={<Result />} />
          <Route path="/portfolio" element={<Portfolio />} />
        </Routes>
      </main>
      <footer className="max-w-6xl mx-auto px-4 py-6 text-xs text-slate-400">
        Config-driven scoring · identical engine on client and server · scores 300–900
      </footer>
    </ConfigProvider>
  );
}
