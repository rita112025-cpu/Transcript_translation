import { useState } from 'react';
import Dashboard from './components/Dashboard';
import FeasibilityReport from './components/FeasibilityReport';
import Architecture from './components/Architecture';
import TranscriptionUI from './components/TranscriptionUI';
import InstallationGuide from './components/InstallationGuide';
import TestVerification from './components/TestVerification';
import ProjectFiles from './components/ProjectFiles';
import Maintenance from './components/Maintenance';

type Tab = 'dashboard' | 'feasibility' | 'architecture' | 'transcription' | 'installation' | 'testing' | 'files' | 'maintenance';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'dashboard', label: '總覽', icon: '📊' },
    { id: 'feasibility', label: '技術可行性', icon: '🔍' },
    { id: 'architecture', label: '系統架構', icon: '🏗️' },
    { id: 'transcription', label: '轉錄介面', icon: '🎙️' },
    { id: 'installation', label: '安裝指南', icon: '⚙️' },
    { id: 'testing', label: '測試驗證', icon: '✅' },
    { id: 'files', label: '專案檔案', icon: '📁' },
    { id: 'maintenance', label: '維護擴充', icon: '🔧' },
  ];

  return (
    <div className="relative min-h-screen text-white flex flex-col">
      <div className="grain-overlay" aria-hidden="true" />
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-[40%] left-[20%] w-[80%] h-[80%] bg-[radial-gradient(ellipse_at_center,_rgba(120,119,198,0.15),transparent_60%)] blur-[60px]" />
        <div className="absolute -bottom-[30%] right-[10%] w-[60%] h-[60%] bg-[radial-gradient(ellipse_at_center,_rgba(255,119,168,0.10),transparent_60%)] blur-[80px]" />
        <div className="absolute top-[30%] left-[-10%] w-[40%] h-[40%] bg-[radial-gradient(ellipse_at_center,_rgba(120,219,226,0.08),transparent_60%)] blur-[60px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-[18px] bg-[#0a0a0b]/70 border-b border-white/[0.08] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center text-xs font-black tracking-tight">
              MT
            </div>
            <div>
              <h1 className="text-lg font-black uppercase tracking-tight text-white">Meeting Transcriber TW</h1>
              <p className="text-xs text-zinc-400">繁體中文會議錄音轉逐字稿系統 | NVIDIA Parakeet CTC 0.6B zh-TW</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 border border-white/25 text-xs uppercase tracking-wide">v1.0.0</span>
            <span className="px-2 py-1 border border-white/25 text-xs uppercase tracking-wide">NIM API</span>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="relative z-10 border-b border-white/15 px-6">
        <div className="max-w-7xl mx-auto flex gap-1 overflow-x-auto py-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'rounded-full bg-white text-black'
                  : 'rounded-full text-zinc-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="relative z-10 flex-1 px-4 md:px-10 py-8">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} />}
          {activeTab === 'feasibility' && <FeasibilityReport />}
          {activeTab === 'architecture' && <Architecture />}
          {activeTab === 'transcription' && <TranscriptionUI />}
          {activeTab === 'installation' && <InstallationGuide />}
          {activeTab === 'testing' && <TestVerification />}
          {activeTab === 'files' && <ProjectFiles />}
          {activeTab === 'maintenance' && <Maintenance />}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/15 px-6 py-5">
        <div className="max-w-7xl mx-auto text-center text-xs text-zinc-500">
          <p>Meeting Transcriber TW © 2026 | Powered by NVIDIA Parakeet-CTC-0.6B-zh-tw</p>
          <p className="mt-1">模型授權：NVIDIA Community Model License | 部署方式：NVIDIA NIM Cloud API / Self-hosted NIM Container</p>
        </div>
      </footer>
    </div>
  );
}
