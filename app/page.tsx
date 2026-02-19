"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { 
  CheckSquare, Wallet, ArrowRight, Zap, 
  TrendingUp, TrendingDown, Activity, Brain, 
  Plus, AlertTriangle, Search, FileText, Loader2,
  Settings, X
} from 'lucide-react';
import { LocalDB } from '@/lib/db'; 
import { App as CapApp } from '@capacitor/app'; 
import { SettingsManager } from '@/lib/settings';


// Типы для поиска
type SearchResult = {
  id: number;
  title: string;
  type: 'todo' | 'note' | 'transaction';
  meta?: string;
};

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [hideBalances, setHideBalances] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState({
    activeTasks: 0,
    highPriority: 0,
    balance: 0,
    monthlyExpense: 0,
    totalNotes: 0,
    todayLogs: 0,
    userName: 'Commander'
  });


  
  // --- SEARCH STATE ---
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  // --- SYNC ENGINE (НОВАЯ ЧАСТЬ) ---
  // Добавляем этот useEffect, чтобы запускать синхронизацию при входе и появлении сети
  useEffect(() => {
    // 1. Попробовать отправить очередь сразу при запуске Dashboard
    LocalDB.processSyncQueue();

    // 2. Слушать событие "появился интернет"
    const handleOnline = () => {
      console.log('App is online! Syncing...');
      LocalDB.processSyncQueue();
    };

    window.addEventListener('online', handleOnline);
    
    // Чистим слушатель при уходе со страницы
    return () => window.removeEventListener('online', handleOnline);
  }, []);
  // -------------------------------

  useEffect(() => {
    const settings = SettingsManager.get();
    SettingsManager.applyTheme(settings); // Применяем тему
    setHideBalances(settings.hideBalances);
    fetchStats();
    const fetchAnnouncement = async () => {
    const { data } = await supabase.from('system_announcements').select('message').eq('is_active', true).limit(1).maybeSingle();
    if (data) setAnnouncement(data.message);
    };
    fetchAnnouncement();
    SettingsManager.applyTheme(SettingsManager.get());
  }, []);

  // --- Android Back Button (Dashboard) ---
  useEffect(() => {
    const handleBackButton = async () => {
      // 1. Если открыт поиск (введен текст) — очищаем его
      if (searchQuery) {
        setSearchQuery('');
        return;
      }

      // 2. Если мы на главной и ничего не открыто — сворачиваем приложение
      CapApp.minimizeApp();
    };

    const listener = CapApp.addListener('backButton', handleBackButton);
    return () => {
      listener.then(l => l.remove());
    };
  }, [searchQuery]); // Зависимость от searchQuery обязательна!

  // --- SEARCH LOGIC ---
  useEffect(() => {
    const delaySearch = setTimeout(async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }
      
      setIsSearching(true);
      const q = `%${searchQuery}%`; // Для поиска "содержит"

      try {
        // 1. Ищем в Задачах
        const { data: todos } = await supabase
          .from('todos')
          .select('id, title')
          .ilike('title', q)
          .limit(3);

        // 2. Ищем в Заметках
        const { data: notes } = await supabase
          .from('notes')
          .select('id, title')
          .ilike('title', q)
          .limit(3);

        // 3. Ищем в Финансах
        const { data: transactions } = await supabase
          .from('transactions')
          .select('id, title, amount')
          .ilike('title', q)
          .limit(3);

        const results: SearchResult[] = [];

        if (todos) todos.forEach(t => results.push({ id: t.id, title: t.title, type: 'todo' }));
        if (notes) notes.forEach(n => results.push({ id: n.id, title: n.title, type: 'note' }));
        if (transactions) transactions.forEach(t => results.push({ id: t.id, title: t.title, type: 'transaction', meta: `${t.amount} ₽` }));

        setSearchResults(results);
      } catch (error) {
        console.error('Search error', error);
      } finally {
        setIsSearching(false);
      }

    }, 300); // Debounce 300ms

    return () => clearTimeout(delaySearch);
  }, [searchQuery]);


  const fetchStats = async () => {
    // 1. АВТОРИЗАЦИЯ (Берем из кэша сессии)
    const { data: { session } } = await supabase.auth.getSession();
    const currentUser = session?.user;
    const userId = currentUser?.id; // <--- ВАЖНО: Получаем ID для фильтра
    setUser(currentUser);
    
    const realName = currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0] || 'Commander';

    try {
        // 2. ЗАГРУЖАЕМ ВСЕ ДАННЫЕ ИЗ LOCALDB
        const allTodos = await LocalDB.getAll<any>('todos');
        const allTrans = await LocalDB.getAll<any>('transactions');
        const allNotes = await LocalDB.getAll<any>('notes');
        const allLogs = await LocalDB.getAll<any>('system_logs');

        // --- ФИЛЬТРАЦИЯ (Оставляем только свои данные) ---
        // Если user_id нет (старая запись), она отсеется.
        const lTodos = allTodos.filter((t: any) => t.user_id === userId);
        const lTrans = allTrans.filter((t: any) => t.user_id === userId);
        const lNotes = allNotes.filter((n: any) => n.user_id === userId);
        const lLogs = allLogs.filter((l: any) => l.user_id === userId);

        // 3. РАСЧЕТЫ (Твой код без изменений, но работает уже с чистыми данными)

        // --- Задачи ---
        // Было: .eq('is_complete', false)
        const activeTasksList = lTodos ? lTodos.filter((t: any) => !t.is_complete) : [];
        const activeTasks = activeTasksList.length;
        
        // Было: .filter(t => t.priority === 'high')
        const highPriority = activeTasksList.filter((t: any) => t.priority === 'high').length;

        // --- Заметки ---
        // Было: .select('*', { count: 'exact' })
        const totalNotes = lNotes ? lNotes.length : 0;

        // --- Chronos (Лента) ---
        // Было: .gte('created_at', todayStart)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const todayLogs = lLogs ? lLogs.filter((l: any) => new Date(l.created_at) >= todayStart).length : 0;

        // --- Финансы ---
        let bal = 0;
        let expMonth = 0;
        const currentMonth = new Date().getMonth();

        if (lTrans) {
            lTrans.forEach((t: any) => {
                const val = Number(t.amount);
                if (t.type === 'income') {
                    bal += val;
                } else {
                    bal -= val;
                    // Проверяем, была ли трата в этом месяце
                    if (new Date(t.created_at).getMonth() === currentMonth) {
                        expMonth += val;
                    }
                }
            });
        }

        // 4. ОБНОВЛЯЕМ ИНТЕРФЕЙС
        setStats({
            activeTasks,
            highPriority,
            balance: bal,
            monthlyExpense: expMonth,
            totalNotes,
            todayLogs,
            userName: realName
        });
        
        // 5. ФОНОВОЕ ОБНОВЛЕНИЕ (Скачиваем с сервера, если база пуста или устарела)
        if (navigator.onLine && userId) {
            const [rTodos, rTrans, rNotes, rLogs] = await Promise.all([
                supabase.from('todos').select('*'),
                supabase.from('transactions').select('*'),
                supabase.from('notes').select('*'),
                supabase.from('system_logs').select('*').order('created_at', { ascending: false }).limit(50)
            ]);

            // Если данные пришли - сохраняем в телефон
            if (rTodos.data) await LocalDB.put('todos', rTodos.data);
            if (rTrans.data) await LocalDB.put('transactions', rTrans.data);
            if (rNotes.data) await LocalDB.put('notes', rNotes.data);
            if (rLogs.data) await LocalDB.put('system_logs', rLogs.data);

            // И заново пересчитываем цифры для свежих данных (копия логики выше)
            const newTodos = rTodos.data || lTodos; // Берем новые или оставляем старые
            const newTrans = rTrans.data || lTrans;
            const newNotes = rNotes.data || lNotes;
            const newLogs = rLogs.data || lLogs;

            // Расчеты по новым данным
            // Задачи
            const newActiveList = newTodos.filter((t: any) => !t.is_complete);
            const newActive = newActiveList.length;
            const newHigh = newActiveList.filter((t: any) => t.priority === 'high').length;
            
            // Финансы
            let newBal = 0;
            let newExpMonth = 0;
            newTrans.forEach((t: any) => {
               const val = Number(t.amount);
               if (t.type === 'income') newBal += val;
               else {
                   newBal -= val;
                   if (new Date(t.created_at).getMonth() === currentMonth) newExpMonth += val;
               }
            });

            // Обновляем экран второй раз (уже точными данными)
            setStats({
                activeTasks: newActive,
                highPriority: newHigh,
                balance: newBal,
                monthlyExpense: newExpMonth,
                totalNotes: newNotes.length,
                todayLogs: newLogs.filter((l: any) => new Date(l.created_at) >= todayStart).length,
                userName: realName
            });
        }
        
    } catch (e) {
        console.error("Ошибка чтения локальной статистики:", e);
    } finally {
        // Выключаем загрузку в любом случае (даже если ошибка)
        setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Доброе утро';
    if (hour < 18) return 'Добрый день';
    return 'Добрый вечер';
  };

  const formatRub = (val: number) => {
    if (hideBalances) return '***';
    return val.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
  };

  const getNoun = (number: number, one: string, two: string, five: string) => {
    let n = Math.abs(number);
    n %= 100;
    if (n >= 5 && n <= 20) return five;
    n %= 10;
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return two;
    return five;
  };

  // Иконка для результата поиска
  const getResultIcon = (type: string) => {
    if (type === 'todo') return <CheckSquare size={14} className="text-indigo-400"/>;
    if (type === 'note') return <Brain size={14} className="text-amber-400"/>;
    if (type === 'transaction') return <Wallet size={14} className="text-emerald-400"/>;
    return <FileText size={14} />;
  };

  // Ссылка для результата
  const getResultLink = (type: string, id: number) => {
    if (type === 'todo') return `/tasks?id=${id}`;
    if (type === 'note') return `/brain?id=${id}`;
    if (type === 'transaction') return `/finance?id=${id}`;
    return '/';
  };

  return (
    <div className="p-4 md:p-8 h-full flex flex-col max-w-6xl mx-auto relative overflow-y-auto custom-scrollbar">
      
      {/* --- GLOBAL SEARCH BAR --- */}
      <div className="mb-8 relative z-30">
         <div className="relative group">
            <Search className="absolute left-4 top-3.5 text-muted group-focus-within:text-main transition" size={20} />
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              type="text" 
              placeholder="Глобальный поиск (Задачи, Заметки, Финансы)..." 
              className="w-full bg-card border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-main focus:outline-none focus:border-indigo-500 transition shadow-lg"
            />
            {isSearching && (
              <div className="absolute right-4 top-3.5">
                <Loader2 size={20} className="animate-spin text-muted" />
              </div>
            )}
         </div>

         {/* SEARCH RESULTS DROPDOWN */}
         {searchQuery && (
           <div className="absolute top-full left-0 w-full mt-2 bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2">
              {searchResults.length > 0 ? (
                <div className="py-2">
                  <div className="px-4 py-2 text-[10px] uppercase font-bold text-muted tracking-wider">Результаты поиска</div>
                  {searchResults.map((res) => (
                    <Link key={`${res.type}-${res.id}`} href={getResultLink(res.type, res.id)} className="flex items-center justify-between px-4 py-3 hover:bg-white/5 transition group">
                       <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-white/5 group-hover:bg-white/10 transition">
                            {getResultIcon(res.type)}
                          </div>
                          <div>
                             <div className="text-sm text-main font-medium">{res.title}</div>
                             <div className="text-xs text-muted capitalize">{res.type === 'todo' ? 'Задача' : res.type === 'note' ? 'Заметка' : 'Транзакция'}</div>
                          </div>
                       </div>
                       {res.meta && <div className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">{res.meta}</div>}
                    </Link>
                  ))}
                </div>
              ) : (
                !isSearching && <div className="p-6 text-center text-muted text-sm">Ничего не найдено</div>
              )}
           </div>
         )}
      </div>

      {/* SYSTEM ANNOUNCEMENT */}
      {announcement && (
         <div className="mb-6 px-4 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-between text-indigo-400 animate-in slide-in-from-top-4 shadow-lg shadow-indigo-500/5">
           <div className="flex items-center gap-3">
             <AlertTriangle size={18} className="shrink-0" />
             <span className="text-sm font-medium leading-snug">{announcement}</span>
           </div>
           <button onClick={() => setAnnouncement(null)} className="p-1 hover:bg-indigo-500/20 rounded-lg transition ml-4 shrink-0">
             <X size={16} />
           </button>
         </div>
      )}

      {/* HEADER */}
      <div className="mb-8 animate-in slide-in-from-top-4 duration-500 flex justify-between items-start">
        <div>
           <h1 className="text-2xl md:text-4xl font-bold text-main mb-2 leading-tight">
             {getGreeting()}, <br className="md:hidden" /> <span className="text-primary">{stats.userName}</span>.
           </h1>
           <p className="text-sm md:text-base text-muted">Системы Nexus работают в штатном режиме.</p>
        </div>
        
        {/* КНОПКА НАСТРОЕК */}
        <Link href="/settings" className="p-3 bg-card border border-neutral-500/10 rounded-full hover:bg-white/10 transition text-muted hover:text-main mt-1">
           <Settings size={20} />
        </Link>
      </div>

      {/* KEY METRICS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-10">
        
        {/* 1. Tasks Card */}
        <Link href="/tasks" className="group p-5 md:p-6 bg-card/50 border border-neutral-500/10 rounded-3xl hover:border-indigo-500/50 transition relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition transform group-hover:scale-110">
            <CheckSquare size={64} className="text-indigo-500" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400"><CheckSquare size={20} /></div>
            <span className="text-sm font-medium text-neutral-300">Задачи</span>
          </div>
          <div className="text-3xl font-bold text-main mb-1">{loading ? '...' : stats.activeTasks}</div>
          <div className="text-xs text-muted">
            {stats.highPriority > 0 ? <span className="text-rose-400">{stats.highPriority} с высоким приоритетом</span> : 'Все спокойно'}
          </div>
        </Link>

        {/* 2. Finance Card */}
        <Link href="/finance" className="group p-5 md:p-6 bg-card/50 border border-neutral-500/10 rounded-3xl hover:border-emerald-500/50 transition relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition transform group-hover:scale-110">
            <Wallet size={64} className="text-emerald-500" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400"><Wallet size={20} /></div>
            <span className="text-sm font-medium text-neutral-300">Финансы</span>
          </div>
          <div className="text-3xl font-bold text-main mb-1">{loading ? '...' : formatRub(stats.balance)}</div>
          <div className="text-xs text-muted flex items-center gap-1">
            <TrendingDown size={12} className="text-rose-400"/>
            Расход мес: {formatRub(stats.monthlyExpense)}
          </div>
        </Link>

        {/* 3. Brain Card */}
        <Link href="/brain" className="group p-5 md:p-6 bg-card/50 border border-neutral-500/10 rounded-3xl hover:border-amber-500/50 transition relative overflow-hidden">
           <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition transform group-hover:scale-110">
            <Brain size={64} className="text-amber-500" />
          </div>
           <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400"><Brain size={20} /></div>
            <span className="text-sm font-medium text-neutral-300">База Знаний</span>
          </div>
          <div className="text-3xl font-bold text-main mb-1">{loading ? '...' : stats.totalNotes}</div>
          <div className="text-xs text-muted">
             {loading ? 'Загрузка...' : getNoun(stats.totalNotes, 'Активная заметка', 'Активные заметки', 'Активных заметок')}
          </div>
        </Link>

         {/* 4. Chronos Card */}
         <Link href="/chronos" className="group p-5 md:p-6 bg-card/50 border border-neutral-500/10 rounded-3xl hover:border-rose-500/50 transition relative overflow-hidden">
           <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition transform group-hover:scale-110">
            <Activity size={64} className="text-rose-500" />
          </div>
           <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-rose-500/10 rounded-lg text-rose-400"><Activity size={20} /></div>
            <span className="text-sm font-medium text-neutral-300">Chronos</span>
          </div>
          <div className="text-3xl font-bold text-main mb-1">{loading ? '...' : stats.todayLogs}</div>
          <div className="text-xs text-muted">
             {loading ? 'Загрузка...' : getNoun(stats.todayLogs, 'Событие сегодня', 'События сегодня', 'Событий сегодня')}
          </div>
        </Link>
      </div>

      {/* QUICK ACTIONS ROW */}
      <h3 className="text-sm font-medium text-muted mb-4 uppercase tracking-wider">Быстрый переход</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
         <Link href="/tasks" className="p-4 rounded-2xl bg-card border border-neutral-500/10 hover:bg-neutral-800 transition flex flex-col md:flex-row items-start md:items-center justify-between group gap-2">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500 group-hover:text-main transition"><Zap size={16}/></div>
               <span className="text-sm text-main">Задача</span>
            </div>
            <ArrowRight size={16} className="hidden md:block text-neutral-600 group-hover:text-main transition"/>
         </Link>
      
         <Link href="/finance" className="p-4 rounded-2xl bg-card border border-neutral-500/10 hover:bg-neutral-800 transition flex flex-col md:flex-row items-start md:items-center justify-between group gap-2">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-main transition"><TrendingUp size={16}/></div>
               <span className="text-sm text-main">Доход</span>
            </div>
            <ArrowRight size={16} className="hidden md:block text-neutral-600 group-hover:text-main transition"/>
         </Link>
      
         <Link href="/brain" className="p-4 rounded-2xl bg-card border border-neutral-500/10 hover:bg-neutral-800 transition flex flex-col md:flex-row items-start md:items-center justify-between group gap-2">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-main transition"><Plus size={16}/></div>
               <span className="text-sm text-main">Мысль</span>
            </div>
            <ArrowRight size={16} className="hidden md:block text-neutral-600 group-hover:text-main transition"/>
         </Link>
      
         <Link href="/chronos" className="p-4 rounded-2xl bg-card border border-neutral-500/10 hover:bg-neutral-800 transition flex flex-col md:flex-row items-start md:items-center justify-between group gap-2">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 group-hover:bg-rose-500 group-hover:text-main transition"><Activity size={16}/></div>
               <span className="text-sm text-main">Лента</span>
            </div>
            <ArrowRight size={16} className="hidden md:block text-neutral-600 group-hover:text-main transition"/>
         </Link>
      </div>

      {/* DECORATIVE FOOTER */}
      <div className="mt-auto pt-10 flex justify-between items-end opacity-20 hover:opacity-50 transition">
         <div className="text-[10px] text-muted font-mono">
            NEXUS OS v1.0 <br/>
            SYSTEM: ONLINE
         </div>
         <div className="flex gap-1">
            <div className="w-1 h-1 bg-white rounded-full animate-ping"/>
            <div className="w-1 h-1 bg-white rounded-full"/>
            <div className="w-1 h-1 bg-white rounded-full"/>
         </div>
      </div>
    </div>
  );
} 