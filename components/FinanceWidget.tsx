"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  PieChart as PieIcon, List, Plus, Trash2, Edit2, 
  ArrowLeftRight, ArrowDownLeft, AlertTriangle, X 
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { getIcon, ICON_MAP } from '@/lib/icons';
import { logEvent } from '@/lib/log';
import { useDevice } from '@/lib/device';
import { LocalDB } from '@/lib/db';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { App as CapApp } from '@capacitor/app';
import { SettingsManager } from '@/lib/settings';

// --- Types ---
type Transaction = {
  id: number; 
  user_id?: string; // <--- Добавили поле владельца
  title: string; 
  amount: number; 
  type: 'income' | 'expense';
  category: string; 
  created_at: string;
};
type Category = {
  id: number; 
  user_id?: string; // <--- Добавили поле владельца
  label: string; 
  icon_key: string; 
  color: string; 
  type: 'income' | 'expense';
};
type Confirmation = {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
};

export default function FinanceWidget() {
  // State: Views & Data
  const router = useRouter();
  const { isTouch } = useDevice();
  const [view, setView] = useState<'overview' | 'history' | 'add' | 'categories'>('overview');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [usdRate, setUsdRate] = useState(90); // Дефолт, обновится из настроек
  const [monthlyLimit, setMonthlyLimit] = useState(50000);

  const searchParams = useSearchParams();

  // Эффект для открытия записи из поиска
  useEffect(() => {
    const idParam = searchParams.get('id');
    if (idParam && transactions.length > 0) {
      const targetId = parseInt(idParam);
      const targetTx = transactions.find(t => t.id === targetId);

      if (targetTx) {
        startEdit(targetTx); // Открываем форму редактирования
        window.history.replaceState(null, '', '/finance');
      }
    }
  }, [searchParams, transactions]);
  
  const [currency, setCurrency] = useState<'USD' | 'RUB'>('RUB');
  
  // State: UI & Modal
  const [confirmModal, setConfirmModal] = useState<Confirmation>({ isOpen: false, message: '', onConfirm: () => {} });

  // State: Forms
  const [editId, setEditId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('');
  const [txType, setTxType] = useState<'income' | 'expense'>('expense');
  
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('star');
  const [chartMode, setChartMode] = useState<'expense' | 'income' | 'total'>('total');
  const [hideBalances, setHideBalances] = useState(false);

  useEffect(() => {
    const s = SettingsManager.get();
    setHideBalances(s.hideBalances);
    fetchTransactions();
    fetchCategories();
  }, []);

  useEffect(() => {
    const s = SettingsManager.get();
    setHideBalances(s.hideBalances);
    // --- НОВОЕ ---
    setUsdRate(s.usdRate);
    setMonthlyLimit(s.monthlyLimit);
    // ------------
    fetchTransactions();
    fetchCategories();
  }, []);

  const fetchTransactions = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // 1. LOCAL FIRST (Грузим всё, фильтруем своё)
    const lData = await LocalDB.getAll<Transaction>('transactions');
    
    // ИЗОЛЯЦИЯ: Берем только свои записи
    const myData = userId ? lData.filter(t => t.user_id === userId) : [];

    if (myData.length > 0) {
      setTransactions(myData.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    }

    // 2. REMOTE (Запрос к серверу, он сам отфильтрует по RLS, но мы страхуемся)
    const { data: remoteData } = await supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(100);
    
    // 3. SMART MERGE (Умное слияние)
    if (remoteData) {
      const currentLocal = await LocalDB.getAll<Transaction>('transactions');
      
      // Фильтруем: только мои + оффлайновые (id < 0)
      const unsyncedItems = currentLocal.filter(t => t.id < 0 && t.user_id === userId);
      
      // Объединяем
      const merged = [...remoteData, ...unsyncedItems].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setTransactions(merged);
      // Сохраняем (лучше сохранить merged целиком, но осторожно с чужими данными, если они были. 
      // В идеале мы просто обновляем кэш).
      await LocalDB.put('transactions', merged); 
    }
  };

  const fetchCategories = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // 1. Local
    const lData = await LocalDB.getAll<Category>('categories');
    // Категории могут быть общими (системными) или личными. 
    // Предположим, что системные не имеют user_id или имеют null.
    // Если у тебя категории общие для всех, фильтр можно убрать. 
    // Если личные - оставляем.
    const myCats = userId ? lData.filter(c => c.user_id === userId || !c.user_id) : lData;
    
    if (myCats.length > 0) setCategories(myCats);

    // 2. Remote
    const { data: remoteData } = await supabase.from('categories').select('*');
    
    // 3. Smart Merge
    if (remoteData) {
      const currentLocal = await LocalDB.getAll<Category>('categories');
      const unsyncedCats = currentLocal.filter(c => c.id < 0 && c.user_id === userId); 

      const merged = [...remoteData, ...unsyncedCats];
      setCategories(merged);
      await LocalDB.put('categories', merged);
    }
  };

  // --- Helpers ---
  const formatMoney = (val: number) => {
    if (hideBalances) return '***';
    const finalVal = currency === 'USD' ? val / usdRate : val; // usdRate вместо константы
    return currency === 'RUB' 
      ? `₽${finalVal.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}` 
      : `$${finalVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getCategoryInfo = (label: string) => {
    return categories.find(c => c.label === label) || { icon_key: 'zap', color: '#9CA3AF', label };
  };

  // --- Analytics ---
  const stats = useMemo(() => {
    let balance = 0;
    let incomeTotal = 0;
    let expenseTotal = 0;
    const chartMap: Record<string, number> = {};

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    transactions.forEach(t => {
      const val = Number(t.amount);
      const txDate = new Date(t.created_at);
      
      // 1. ОБЩИЙ БАЛАНС (Считаем за всё время)
      if (t.type === 'income') {
        balance += val;
      } else {
        balance -= val;
      }

      // 2. СТАТИСТИКА ЗА МЕСЯЦ
      if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
        
        // Считаем суммы за месяц
        if (t.type === 'income') {
          incomeTotal += val;
        } else {
          expenseTotal += val;
        }
        
        // Собираем данные для категорий (если режим не 'total')
        if (chartMode !== 'total' && t.type === chartMode) {
          chartMap[t.category] = (chartMap[t.category] || 0) + val;
        }
      }
    });

    let chartData;

    // --- НОВАЯ ЛОГИКА: Режим "Общий" ---
    if (chartMode === 'total') {
       chartData = [
         { 
           name: 'Доходы', 
           value: currency === 'USD' ? incomeTotal / usdRate : incomeTotal, 
           color: '#34D399' // Emerald
         },
         { 
           name: 'Расходы', 
           value: currency === 'USD' ? expenseTotal / usdRate : expenseTotal, 
           color: '#F87171' // Rose
         }
       ];
       // Фильтруем нули, чтобы пустые сектора не ломали график
       chartData = chartData.filter(d => d.value > 0);
    } else {
       // Старая логика для категорий
       chartData = Object.entries(chartMap).map(([key, value]) => {
        const info = getCategoryInfo(key);
        return { 
          name: key, 
          value: currency === 'USD' ? value / usdRate : value,
          color: info.color 
        };
      });
    }

    return { balance, incomeTotal, expenseTotal, chartData };
  }, [transactions, categories, currency, chartMode, usdRate]);

  // --- Actions ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !title || !selectedCat) return;
    
    // Получаем user_id
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    let val = parseFloat(amount);
    if (currency === 'USD') val = val * usdRate;
    
    const payload = { title, amount: val, type: txType, category: selectedCat };

    if (editId) {
      // --- UPDATE ---
      const updatedTx = { ...transactions.find(t => t.id === editId)!, ...payload };
      
      setTransactions(transactions.map(t => t.id === editId ? updatedTx : t));
      await LocalDB.put('transactions', updatedTx);
      
      const { error } = await supabase.from('transactions').update(payload).eq('id', editId);
      if (error) {
         if (editId > 0) {
            await LocalDB.addToSyncQueue({ table: 'transactions', type: 'UPDATE', payload: { ...payload, id: editId } });
         }
      } else {
        logEvent('finance', 'update', `Обновлено: ${title}`, { amount: val, id: editId });
      }
      setEditId(null);
    } else {
      // --- CREATE (ISOLATED) ---
      const tempId = LocalDB.generateLocalId();
      
      const newTxLocal = { 
          ...payload, 
          id: tempId, 
          user_id: userId, // <--- ВАЖНО
          created_at: new Date().toISOString() 
      };

      // 1. UI + Local
      setTransactions([newTxLocal, ...transactions]);
      await LocalDB.put('transactions', newTxLocal);

      // 2. Remote / Queue
      const { data, error } = await supabase.from('transactions').insert([payload]).select().single();
      
      if (data && !error) {
         // Успех
         const realTx = { ...newTxLocal, ...data };
         setTransactions(prev => prev.map(t => t.id === tempId ? realTx : t));
         await LocalDB.delete('transactions', tempId);
         await LocalDB.put('transactions', realTx);
         logEvent('finance', txType === 'income' ? 'income' : 'expense', `${title} (${val}₽)`, { amount: val, id: realTx.id });
      } else {
         // Очередь
         await LocalDB.addToSyncQueue({ table: 'transactions', type: 'INSERT', payload: newTxLocal, tempId });
      }
    }
    setAmount(''); setTitle(''); setView('overview');
  };

  const startEdit = (t: Transaction) => {
    setEditId(t.id);
    setTitle(t.title);
    const editVal = currency === 'USD' ? t.amount / usdRate : t.amount;
    setAmount(editVal.toFixed(currency === 'USD' ? 2 : 0)); 
    setTxType(t.type);
    setSelectedCat(t.category);
    setView('add');
  };

  const requestDelete = (id: number) => {
    setConfirmModal({
      isOpen: true,
      message: 'Удалить эту запись безвозвратно?',
      onConfirm: async () => {
        const tx = transactions.find(t => t.id === id);
        if (tx) logEvent('finance', 'delete', `Удалено: ${tx.title}`);
        
        setTransactions(prev => prev.filter(t => t.id !== id));
        await LocalDB.delete('transactions', id);
        
        const { error } = await supabase.from('transactions').delete().eq('id', id);
        if (error) {
           await LocalDB.addToSyncQueue({ table: 'transactions', type: 'DELETE', payload: { id } });
        }
        
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleCreateCategory = async () => {
    if (!newCatLabel) return;
    
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const color = txType === 'income' ? '#34D399' : '#F87171';
    const payload = { label: newCatLabel, icon_key: newCatIcon, color, type: txType };
    
    // Optimistic Local
    const tempId = LocalDB.generateLocalId();
    const localCat = { 
        ...payload, 
        id: tempId, 
        user_id: userId // <--- ВАЖНО
    };
    
    setCategories([...categories, localCat]);
    await LocalDB.put('categories', localCat);

    const { data, error } = await supabase.from('categories').insert([payload]).select().single();
    
    if (data && !error) {
       setCategories(prev => prev.map(c => c.id === tempId ? data : c));
       await LocalDB.delete('categories', tempId);
       await LocalDB.put('categories', data);
    } else {
       await LocalDB.addToSyncQueue({ table: 'categories', type: 'INSERT', payload: localCat, tempId });
    }
    
    setSelectedCat(newCatLabel);
    setNewCatLabel('');
    setView('add');
  };

  // --- Android Back Button Logic ---
  useEffect(() => {
    const handleBackButton = async () => {
      // 1. Уровень: Модальное окно
      if (confirmModal.isOpen) {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        return;
      }

      // 2. Уровень: Создание категории (возвращаемся в форму добавления транзакции)
      if (view === 'categories') {
        setView('add');
        return;
      }

      // 3. Уровень: Второстепенные экраны (История или Добавление)
      if (view === 'history' || view === 'add') {
        // Если была форма редактирования — сбрасываем её
        if (view === 'add') {
           setEditId(null); 
           setAmount(''); 
           setTitle('');
        }
        setView('overview');
        return;
      }

      // 4. Уровень: Главный экран виджета
      if (view === 'overview') {
        router.push('/'); // Возвращаемся на Главную дашборда
      }
    };

    const listener = CapApp.addListener('backButton', handleBackButton);
    return () => {
      listener.then(l => l.remove());
    };
  }, [view, confirmModal.isOpen]); // Зависимости

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 shrink-0">
        <div className="group cursor-pointer flex flex-col" onClick={() => setCurrency(c => c === 'USD' ? 'RUB' : 'USD')}>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-light text-white group-hover:text-indigo-400 transition">{currency} Mode</h3>
            <ArrowLeftRight size={14} className="text-neutral-600 group-hover:text-indigo-400 transition" />
          </div>
          <p className="text-xs text-neutral-500 font-mono">
            Баланс: <span className={stats.balance >= 0 ? 'text-white' : 'text-rose-500'}>{formatMoney(stats.balance)}</span>
          </p>
        </div>
        <div className="flex bg-neutral-900 rounded-lg p-1 border border-white/10">
          <button onClick={() => setView('overview')} className={`p-2 rounded-md transition ${view === 'overview' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'}`}><PieIcon size={18} /></button>
          <button onClick={() => setView('history')} className={`p-2 rounded-md transition ${view === 'history' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'}`}><List size={18} /></button>
          <button onClick={() => { setEditId(null); setAmount(''); setTitle(''); setView('add'); }} className={`p-2 rounded-md transition ${view === 'add' ? 'bg-indigo-600 text-white' : 'text-neutral-500 hover:text-white'}`}><Plus size={18} /></button>
        </div>
      </div>

      {/* VIEW: OVERVIEW */}
      {view === 'overview' && (
        <div className="flex-1 flex flex-col animate-in fade-in zoom-in duration-300 min-h-0">
          <div className="flex gap-2 mb-4 shrink-0">
            {/* 1. Кнопка ОБЩИЙ */}
            <button 
              onClick={() => setChartMode('total')} 
              className={`flex-1 p-3 rounded-xl border transition flex flex-col items-center justify-center ${chartMode === 'total' ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-neutral-900/50 border-white/5 opacity-60'}`}
            >
              <span className="text-[9px] text-indigo-400 uppercase font-bold mb-1">Баланс</span>
              <div className="text-xs font-bold text-white">
                 {/* Показываем разницу Доход - Расход за месяц */}
                 {formatMoney(stats.incomeTotal - stats.expenseTotal)}
              </div>
            </button>

            {/* 2. Кнопка РАСХОДЫ */}
            <button 
              onClick={() => setChartMode('expense')} 
              className={`flex-1 p-3 rounded-xl border transition flex flex-col items-center ${chartMode === 'expense' ? 'bg-rose-500/10 border-rose-500/50' : 'bg-neutral-900/50 border-white/5 opacity-60'}`}
            >
              <span className="text-[9px] text-rose-400 uppercase">Расходы</span>
              <div className={`text-md font-bold ${stats.expenseTotal > monthlyLimit ? 'text-rose-500 animate-pulse' : 'text-white'}`}>
                  {formatMoney(stats.expenseTotal)}
              </div>
            </button>

            {/* 3. Кнопка ДОХОДЫ */}
            <button 
              onClick={() => setChartMode('income')} 
              className={`flex-1 p-3 rounded-xl border transition flex flex-col items-center ${chartMode === 'income' ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-neutral-900/50 border-white/5 opacity-60'}`}
            >
              <span className="text-[9px] text-emerald-400 uppercase">Доходы</span>
              <div className="text-md font-bold text-white">{formatMoney(stats.incomeTotal)}</div>
            </button>
          </div>
          
          <div className="flex-1 relative min-h-[150px] w-full">
            {stats.chartData.length > 0 ? (
              <div className="absolute inset-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.chartData}
                      innerRadius="60%"
                      outerRadius="80%"
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {stats.chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <RechartsTooltip 
                      formatter={(value: any) => [
                        currency === 'RUB' 
                          ? `₽${value.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}` 
                          : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 
                        ''
                      ]}
                      contentStyle={{ backgroundColor: '#171717', borderColor: '#333', borderRadius: '8px', fontSize: '12px', color: '#fff' }} 
                      itemStyle={{ color: '#fff' }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px' }}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-600 text-xs">Нет данных</div>
            )}
          </div>
        </div>
      )}

      {/* VIEW: HISTORY */}
      {view === 'history' && (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar animate-in slide-in-from-right-4 duration-300">
          {transactions.map(t => {
            const cat = getCategoryInfo(t.category);
            return (
              <div key={t.id} className="group flex justify-between items-center p-3 rounded-xl bg-neutral-900/30 border border-white/5 hover:bg-neutral-900 transition">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5" style={{ color: cat.color }}>{getIcon(cat.icon_key)}</div>
                  <div className="overflow-hidden">
                    <div className="text-sm text-white font-medium truncate w-24 sm:w-auto">{t.title}</div>
                    <div className="text-[10px] text-neutral-500">{new Date(t.created_at).toLocaleDateString()} • {t.category}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className={`text-sm font-mono ${t.type === 'income' ? 'text-emerald-400' : 'text-white'}`}>
                    {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount)}
                  </div>
                  <div className={`flex gap-2 transition ${isTouch ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <button onClick={() => startEdit(t)} className="text-neutral-500 hover:text-indigo-400"><Edit2 size={14} /></button>
                    <button onClick={() => requestDelete(t.id)} className="text-neutral-500 hover:text-rose-500"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* VIEW: ADD / EDIT */}
      {view === 'add' && (
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col animate-in slide-in-from-bottom-4 duration-300 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
             <div className="text-sm font-medium text-white">{editId ? 'Редактирование' : 'Новая запись'}</div>
             {editId && <button type="button" onClick={() => {setEditId(null); setView('overview')}} className="text-xs text-rose-400">Отмена</button>}
          </div>
          <div className="flex p-1 bg-neutral-900 rounded-lg mb-4 border border-white/5">
            <button type="button" onClick={() => setTxType('expense')} className={`flex-1 py-1.5 text-xs rounded-md transition ${txType === 'expense' ? 'bg-rose-500/20 text-rose-400' : 'text-neutral-500'}`}>Расход</button>
            <button type="button" onClick={() => setTxType('income')} className={`flex-1 py-1.5 text-xs rounded-md transition ${txType === 'income' ? 'bg-emerald-500/20 text-emerald-400' : 'text-neutral-500'}`}>Доход</button>
          </div>
          <div className="space-y-3 mb-4">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={txType === 'income' ? "Источник дохода?" : "На что потратили?"} className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition" />
            <div className="relative">
              <input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01" placeholder="Сумма" className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition" />
              <span className="absolute right-4 top-3 text-xs text-neutral-500 font-bold">{currency}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar mb-4">
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {categories.filter(c => c.type === txType).map((cat) => (
                <button key={cat.id} type="button" onClick={() => setSelectedCat(cat.label)} className={`flex flex-col items-center justify-center p-2 rounded-xl border transition ${selectedCat === cat.label ? 'bg-white/10 border-white/30' : 'bg-transparent border-transparent hover:bg-white/5'}`}>
                  <div style={{ color: cat.color }} className="mb-1">{getIcon(cat.icon_key)}</div>
                  <span className="text-[9px] text-neutral-400 uppercase tracking-tighter truncate w-full text-center">{cat.label}</span>
                </button>
              ))}
              <button type="button" onClick={() => setView('categories')} className="flex flex-col items-center justify-center p-2 rounded-xl border border-dashed border-white/10 text-neutral-500 hover:text-white hover:border-white/30 transition">
                <Plus size={18} className="mb-1"/><span className="text-[9px] uppercase">Создать</span>
              </button>
            </div>
          </div>
          <button type="submit" className="mt-auto w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-xl transition shadow-lg shadow-indigo-500/20">{editId ? 'Обновить' : 'Зафиксировать'}</button>
        </form>
      )}

      {/* VIEW: CREATE CATEGORY */}
      {view === 'categories' && (
        <div className="flex-1 flex flex-col animate-in zoom-in duration-300">
           <div className="flex items-center gap-2 mb-4">
             <button onClick={() => setView('add')}><ArrowDownLeft size={18} className="text-neutral-400"/></button>
             <h3 className="text-sm font-medium text-white">Новая категория</h3>
           </div>
           <input value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)} placeholder="Название" className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white mb-4 focus:outline-none focus:border-indigo-500" />
           <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-5 gap-2 content-start mb-4">
             {Object.keys(ICON_MAP).map(iconName => (
               <button key={iconName} onClick={() => setNewCatIcon(iconName)} className={`p-2 rounded-lg flex items-center justify-center transition ${newCatIcon === iconName ? 'bg-indigo-600 text-white' : 'bg-neutral-900 text-neutral-500 hover:bg-neutral-800'}`}>{getIcon(iconName)}</button>
             ))}
           </div>
           <button onClick={handleCreateCategory} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-xl transition">Создать</button>
        </div>
      )}

      {/* MODAL OVERLAY */}
      {confirmModal.isOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-4/5 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex justify-center text-amber-500 mb-3"><AlertTriangle size={32} /></div>
            <h3 className="text-center text-white font-medium mb-1">Вы уверены?</h3>
            <p className="text-center text-xs text-neutral-400 mb-6">{confirmModal.message}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-medium transition">Отмена</button>
              <button onClick={confirmModal.onConfirm} className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition">Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}