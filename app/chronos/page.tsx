"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LocalDB } from '@/lib/db';
import { 
  History, Activity, Calendar, Filter, Smartphone, Monitor, 
  CheckSquare, Wallet, Brain, Zap, ChevronLeft, ChevronRight,
  Dumbbell
} from 'lucide-react';
import { useDevice } from '@/lib/device';
import { useRouter } from 'next/navigation';
import { App as CapApp } from '@capacitor/app';
import { Settings } from 'lucide-react'; // Добавь иконку
import { SettingsManager } from '@/lib/settings';

type LogEntry = {
  id: number;
  user_id?: string;
  module: 'tasks' | 'finance' | 'brain' | 'system' | 'kinetic';
  event_type: string;
  description: string;
  created_at: string;
  meta?: any;
};

export default function ChronosPage() {
  const router = useRouter();
  const { isTouch } = useDevice();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'tasks' | 'finance' | 'brain' | 'kinetic'>('all');
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setLocalSettings] = useState(SettingsManager.get());

  useEffect(() => {
    // --- АВТО-ОЧИСТКА ---
    const cleanupLogs = async () => {
       const s = SettingsManager.get();
       const retentionMs = s.chronosRetentionDays * 24 * 60 * 60 * 1000;
       const cutoffDate = new Date(Date.now() - retentionMs);

       // 1. Чистим локально
       const allLogs = await LocalDB.getAll<LogEntry>('system_logs');
       const oldLogs = allLogs.filter(l => new Date(l.created_at) < cutoffDate);
       
       if (oldLogs.length > 0) {
          console.log(`[Chronos] Cleaning up ${oldLogs.length} old logs...`);
          for (const log of oldLogs) {
             await LocalDB.delete('system_logs', log.id);
          }
          // Обновляем список, если удалили что-то
          setLogs(prev => prev.filter(l => new Date(l.created_at) >= cutoffDate));
       }

       // 2. Чистим удаленно (Опционально, через Supabase RPC или просто DELETE)
       // await supabase.from('system_logs').delete().lt('created_at', cutoffDate.toISOString());
    };
    
    cleanupLogs();
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    // Получаем ID
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    // 1. LOCAL FIRST + FILTER
    const allLocalLogs = await LocalDB.getAll<LogEntry>('system_logs');
    // Оставляем только свои логи
    const myLocalLogs = allLocalLogs.filter(l => l.user_id === userId || (l as any).user_id === userId); // (as any) на случай, если TS ругается
    
    if (myLocalLogs.length > 0) {
      setLogs(myLocalLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setLoading(false);
    }

    // 2. REMOTE (Supabase сам отфильтрует по RLS, но на всякий случай)
    const { data } = await supabase
      .from('system_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    // 3. SYNC
    if (data) {
      setLogs(data as LogEntry[]);
      // Сохраняем в общую кучу, но при следующем чтении мы их отфильтруем
      await LocalDB.put('system_logs', data);
      setLoading(false);
    }
  };

  const filteredLogs = filter === 'all' ? logs : logs.filter(l => l.module === filter);

  // --- ЛОГИКА ДАТА-ПАГИНАЦИИ ---
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 1. Группируем отфильтрованные логи по датам
  const logsByDate = React.useMemo(() => {
    const groups: Record<string, LogEntry[]> = {};
    filteredLogs.forEach(log => {
      // Используем ISO дату (YYYY-MM-DD) как ключ для сортировки
      const dateKey = new Date(log.created_at).toISOString().split('T')[0];
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(log);
    });
    return groups;
  }, [filteredLogs]);

  // 2. Получаем список уникальных дат (от новых к старым)
  const availableDates = React.useMemo(() => {
    return Object.keys(logsByDate).sort((a, b) => b.localeCompare(a));
  }, [logsByDate]);

  // 3. При изменении фильтров или данных выбираем самую свежую дату
  useEffect(() => {
    if (availableDates.length > 0) {
      // Если текущая выбранная дата есть в новом списке - оставляем её, иначе берем первую
      if (!selectedDate || !availableDates.includes(selectedDate)) {
        setSelectedDate(availableDates[0]);
      }
    } else {
      setSelectedDate(null);
    }
  }, [availableDates]);

  // Получаем логи только для выбранной даты
  const currentLogs = selectedDate ? (logsByDate[selectedDate] || []) : [];

  // ИСПРАВЛЕННЫЕ ИКОНКИ (Разные для каждой категории)
  const getIcon = (module: string) => {
    switch(module) {
      case 'tasks': return <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"><CheckSquare size={16}/></div>;
      case 'finance': return <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20"><Wallet size={16}/></div>;
      case 'brain': return <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20"><Brain size={16}/></div>;
      case 'kinetic': return <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500 border border-cyan-500/20"><Dumbbell size={16}/></div>;
      default: return <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20"><Zap size={16}/></div>;
    }
  };

  // --- Android Back Button Logic ---
  useEffect(() => {
    const handleBackButton = async () => {
      // 1. Если включен фильтр — сбрасываем его
      if (filter !== 'all') {
        setFilter('all');
        return;
      }

      // 2. Если фильтров нет — возвращаемся на Главную
      router.push('/');
    };

    const listener = CapApp.addListener('backButton', handleBackButton);
    return () => {
      listener.then(l => l.remove());
    };
  }, [filter]); // Зависимость от filter важна!

  const handleLogClick = (log: LogEntry) => {
    // 1. Если это удаление — никуда не идем (объекта больше нет)
    if (log.event_type === 'delete') return;

    // 2. Если в мета-данных нет ID — тоже стоим на месте (старые логи)
    if (!log.meta?.id) return;

    const targetId = log.meta.id;

    // 3. Навигация в зависимости от модуля
    switch (log.module) {
      case 'tasks':
        // Переход в Задачи. Виджет задач должен уметь читать ?id=... (мы это уже настроили)
        router.push(`/tasks?id=${targetId}`);
        break;
      case 'finance':
        router.push(`/finance?id=${targetId}`);
        break;
      case 'brain':
        router.push(`/brain?id=${targetId}`);
        break;
      case 'kinetic':
        router.push(`/kinetic?id=${targetId}`);
        break;
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-white animate-in fade-in duration-300">
      
      {/* Header */}
      {/* Header (Адаптивный) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 border-b border-white/5 gap-4 shrink-0">
        
        {/* ЛЕВАЯ ЧАСТЬ: Заголовок */}
        <div>
          <h1 className="text-2xl font-light flex items-center gap-3">
            <History className="text-indigo-500" /> Chronos
          </h1>
          <p className="text-xs text-neutral-500 mt-1 flex items-center gap-2">
            Цифровой след активности
            {isTouch ? <Smartphone size={10} /> : <Monitor size={10} />}
          </p>
        </div>

        {/* ПРАВАЯ ЧАСТЬ: Фильтры + Настройки */}
        {/* На мобильном занимаем всю ширину (w-full) */}
        <div className="flex items-center gap-2 w-full md:w-auto">
            
            {/* Группа фильтров (Скроллится горизонтально, если не влезает) */}
            <div className="flex bg-neutral-900 p-1 rounded-lg border border-white/5 flex-1 md:flex-none overflow-x-auto scrollbar-hide">
                {(['all', 'tasks', 'finance', 'brain', 'kinetic'] as const).map(f => ( // <--- Добавили 'kinetic'
                    <button 
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`flex-1 md:flex-none px-3 py-1.5 rounded-md text-xs font-medium transition capitalize whitespace-nowrap ${filter === f ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'}`}
                    >
                    {f === 'all' ? 'Все' : f === 'tasks' ? 'Задачи' : f === 'finance' ? 'Деньги' : f === 'brain' ? 'Мысли' : 'Спорт'} 
                    </button>
                ))}
            </div>

            {/* Кнопка настроек (Не сжимается: shrink-0) */}
            <button 
                onClick={() => setShowSettings(true)} 
                className="p-2 bg-neutral-900 border border-white/5 rounded-lg text-neutral-500 hover:text-white transition shrink-0"
            >
                <Settings size={18} />
            </button>
        </div>
      </div>

      {/* Timeline с Пагинацией */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* ПАНЕЛЬ ДАТ (Пагинация) */}
        {availableDates.length > 0 && (
          <div className="px-4 py-2 bg-neutral-900/50 border-b border-white/5 shrink-0">
             <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                {availableDates.map(dateKey => {
                   const dateObj = new Date(dateKey);
                   const isSelected = selectedDate === dateKey;
                   // Форматируем: "13 фев"
                   const dayStr = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
                   // День недели: "Пт"
                   const weekDay = dateObj.toLocaleDateString('ru-RU', { weekday: 'short' });

                   return (
                      <button
                        key={dateKey}
                        onClick={() => setSelectedDate(dateKey)}
                        aria-label={`Показать события за ${dayStr}`}
                        aria-current={isSelected ? 'page' : undefined}
                        className={`
                          flex flex-col items-center justify-center px-4 py-2 rounded-lg border transition min-w-[70px]
                          ${isSelected 
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/20' 
                            : 'bg-neutral-800 border-white/5 text-neutral-400 hover:bg-neutral-700 hover:text-white'
                          }
                        `}
                      >
                         <span className="text-[10px] uppercase font-bold opacity-70">{weekDay}</span>
                         <span className="text-sm font-medium whitespace-nowrap">{dayStr}</span>
                      </button>
                   );
                })}
             </div>
          </div>
        )}

        {/* СПИСОК СОБЫТИЙ (Скроллится только он) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {loading ? (
               <div className="text-center text-neutral-600 py-10">Загрузка истории...</div>
             ) : currentLogs.length > 0 ? (
               currentLogs.map((log) => {
                 // Здесь больше не нужны разделители дат, так как мы внутри конкретной даты
                 const isClickable = log.event_type !== 'delete' && log.meta?.id;

                 return (
                     <div key={log.id} className="flex gap-4 group animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex flex-col items-center pt-1">
                           {getIcon(log.module)}
                           <div className="w-px h-full bg-white/10 my-2 group-last:hidden min-h-[20px]" />
                        </div>
                        <div className="flex-1 pb-4">
                            <div 
                              onClick={() => handleLogClick(log)}
                              className={`
                                bg-neutral-900 border border-white/10 rounded-xl p-4 shadow-sm transition relative
                                ${isClickable 
                                    ? 'cursor-pointer hover:bg-neutral-800 hover:border-indigo-500/50 active:scale-[0.99]' 
                                    : 'cursor-default opacity-80'
                                }
                              `}
                            >
                                <div className="flex justify-between items-start mb-2">
                                  <span className={`text-xs font-bold uppercase tracking-wider ${
                                    log.event_type === 'delete' || log.event_type === 'expense' ? 'text-rose-400' : 
                                    log.event_type === 'income' || log.event_type === 'complete' ? 'text-emerald-400' : 'text-indigo-400'
                                  }`}>
                                    {log.event_type}
                                  </span>
                                  <span className="text-[10px] text-neutral-600 font-mono">
                                     {new Date(log.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                
                                <p className={`text-sm leading-relaxed font-medium ${log.event_type === 'delete' ? 'text-neutral-500 line-through' : 'text-neutral-200'}`}>
                                    {log.description || <span className="text-neutral-600 italic">Нет описания</span>}
                                </p>
                                
                                {log.meta?.amount && (
                                  <div className="mt-3 text-xs font-mono text-emerald-400 bg-emerald-500/10 inline-block px-2 py-1 rounded border border-emerald-500/20">
                                    {log.meta.amount}
                                  </div>
                                )}
                            </div>
                        </div>
                     </div>
                 );
               })
             ) : (
               <div className="text-center text-neutral-600 py-10 flex flex-col items-center gap-2">
                  <Filter size={32} className="opacity-20"/>
                  <p>Событий нет</p>
               </div>
             )}
          </div>
        </div>
      </div>
      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setShowSettings(false)}>
           <div className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-light mb-6 flex items-center gap-2 text-white">
                 <Settings size={18} className="text-indigo-500"/> Настройки Хроноса
              </h3>
              
              <div className="space-y-6">
                 {/* Срок хранения */}
                 <div>
                    <div className="text-xs text-neutral-500 uppercase font-bold mb-2">Хранить историю</div>
                    <div className="flex bg-neutral-800 rounded-lg p-1 border border-white/5">
                       {[7, 30, 60].map(days => (
                         <button 
                           key={days}
                           onClick={() => {
                              const updated = SettingsManager.save({ chronosRetentionDays: days });
                              setLocalSettings(updated);
                           }}
                           className={`flex-1 py-2 text-xs rounded-md transition ${settings.chronosRetentionDays === days ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'}`}
                         >
                           {days} дн.
                         </button>
                       ))}
                    </div>
                 </div>

                 {/* Фильтры типов */}
                 <div>
                    <div className="text-xs text-neutral-500 uppercase font-bold mb-2">Записывать события</div>
                    <div className="space-y-2">
                       <label className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-xl border border-white/5">
                          <span className="text-sm text-neutral-300">Создание</span>
                          <input type="checkbox" checked={settings.chronosLogCreate} onChange={e => { const u = SettingsManager.save({ chronosLogCreate: e.target.checked }); setLocalSettings(u); }} className="accent-indigo-500 w-4 h-4"/>
                       </label>
                       <label className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-xl border border-white/5">
                          <span className="text-sm text-neutral-300">Изменения</span>
                          <input type="checkbox" checked={settings.chronosLogUpdate} onChange={e => { const u = SettingsManager.save({ chronosLogUpdate: e.target.checked }); setLocalSettings(u); }} className="accent-indigo-500 w-4 h-4"/>
                       </label>
                       <label className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-xl border border-white/5">
                          <span className="text-sm text-neutral-300">Удаление</span>
                          <input type="checkbox" checked={settings.chronosLogDelete} onChange={e => { const u = SettingsManager.save({ chronosLogDelete: e.target.checked }); setLocalSettings(u); }} className="accent-indigo-500 w-4 h-4"/>
                       </label>
                    </div>
                 </div>
              </div>

              <button onClick={() => setShowSettings(false)} className="w-full mt-6 bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl text-sm font-medium transition" aria-label="Открыть настройки Хроноса">
                 Готово
              </button>
           </div>
        </div>
      )}
    </div>
  );
}