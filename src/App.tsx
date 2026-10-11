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
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-600 rounded-lg flex items-center justify-center text-xl font-bold">
              MT
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Meeting Transcriber TW</h1>
              <p className="text-xs text-gray-400">繁體中文會議錄音轉逐字稿系統 | NVIDIA Parakeet CTC 0.6B zh-TW</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-yellow-900/50 text-yellow-300 text-xs rounded-full border border-yellow-700">
              v1.0.0
            </span>
            <span className="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded-full border border-blue-700">
              NIM API
            </span>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-gray-800/50 border-b border-gray-700 px-6">
        <div className="max-w-7xl mx-auto flex gap-1 overflow-x-auto py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 px-6 py-8">
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
      <footer className="bg-gray-800 border-t border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto text-center text-xs text-gray-500">
          <p>Meeting Transcriber TW © 2026 | Powered by NVIDIA Parakeet-CTC-0.6B-zh-tw</p>
          <p className="mt-1">模型授權：NVIDIA Community Model License | 部署方式：NVIDIA NIM Cloud API / Self-hosted NIM Container</p>
        </div>
      </footer>
    </div>
  );
}
