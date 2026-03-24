'use client';

import { useState } from 'react';
import { Dumbbell, Activity, List, Battery } from 'lucide-react';
import KineticLibrary from '@/components/KineticLibrary';
import KineticWorkoutLog from '@/components/KineticWorkoutLog';
import KineticBiometrics from '@/components/KineticBiometrics';

export default function KineticPage() {
  const [activeTab, setActiveTab] = useState<'library' | 'workout' | 'biometrics'>('workout');

  return (
    <div className="h-full flex flex-col p-4 sm:p-6 overflow-hidden">
      {/* Шапка */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Dumbbell className="text-amber-500" size={24} />
            Kinetic
          </h1>
          <p className="text-slate-400 text-sm mt-1">Журнал тренировок и физическое состояние</p>
        </div>
        
        {/* Переключатель вкладок (3 штуки) */}
        <div className="flex bg-neutral-800/50 p-1 rounded-xl border border-white/5 overflow-x-auto max-w-full sm:w-auto flex-nowrap custom-scrollbar shrink-0">
          <button
            onClick={() => setActiveTab('library')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'library' ? 'bg-amber-500/10 text-amber-500 shadow-sm' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <List size={16} />
            Библиотека
          </button>
          <button
            onClick={() => setActiveTab('workout')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'workout' ? 'bg-amber-500/10 text-amber-500 shadow-sm' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Activity size={16} />
            Журнал
          </button>
          <button
            onClick={() => setActiveTab('biometrics')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'biometrics' ? 'bg-amber-500/10 text-amber-500 shadow-sm' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Battery size={16} />
            Замеры
          </button>
        </div>
      </div>

      {/* Основная область контента */}
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar rounded-2xl border border-white/5 bg-neutral-900/30 p-2 sm:p-6">
        {activeTab === 'library' && <div className="h-full"><KineticLibrary /></div>}
        {activeTab === 'workout' && <div className="h-full"><KineticWorkoutLog /></div>}
        
        {activeTab === 'biometrics' && <div className="h-full"><KineticBiometrics /></div>}
      </div>
    </div>
  );
}