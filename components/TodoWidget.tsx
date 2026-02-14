"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { LocalDB } from '@/lib/db';
import { 
  Plus, Check, Trash2, Clock, X, Sun, Layers, 
  Play, Pause, Timer, RotateCcw,
  Banknote, Repeat, AlertTriangle
} from 'lucide-react';
import { format, addDays, addWeeks, addMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import { logEvent } from '@/lib/log';
import { useDevice } from '@/lib/device';
import { useSearchParams } from 'next/navigation';
import { App } from '@capacitor/app'; 
import { useRouter } from 'next/navigation';
import { NotificationManager } from '@/lib/notifications';
import { SettingsManager } from '@/lib/settings';


// --- Types ---
type Subtask = { id: number; title: string; is_complete: boolean; };
type Project = { id: number; name: string; color: string; user_id?: string; };

type Todo = {
  id: number;
  user_id?: string;
  title: string;
  description: string | null;
  is_complete: boolean;
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  is_my_day: boolean;
  project_id: number | null;
  time_spent: number;
  estimated_time: number | null;
  budget: number | null;
  budget_type: 'income' | 'expense';
  currency?: 'USD' | 'RUB';
  inserted_at?: string; // Добавляем правильное поле
  created_at?: string;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  status: 'todo' | 'in_progress' | 'paused' | 'done';
  subtasks: Subtask[];
  completed_at?: string | null;
};

// --- Config ---
const USD_TO_RUB = 80;

const PRIORITIES = {
  high: { label: 'Высокий', text: 'text-rose-500', bg: 'bg-rose-500/20', dot: 'bg-rose-500' },
  medium: { label: 'Средний', text: 'text-amber-500', bg: 'bg-amber-500/20', dot: 'bg-amber-500' },
  low: { label: 'Низкий', text: 'text-neutral-400', bg: 'bg-neutral-800', dot: 'bg-neutral-600' },
};

const PROJECT_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

interface TodoWidgetProps {
  onClose?: () => void; 
}

export default function TodoWidget() {
  const router = useRouter();
  const { isTouch } = useDevice();
  const [view, setView] = useState<'list' | 'form' | 'projects' | 'focus' | 'stats'>('list');
  const [filter, setFilter] = useState<'all' | 'my_day' | number>('my_day');
  
  const [todos, setTodos] = useState<Todo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [addToMyDay, setAddToMyDay] = useState(false);
  const [currentTimeSpent, setCurrentTimeSpent] = useState(0); 

  const searchParams = useSearchParams();

  // 1. Добавляем "запоминалку", чтобы код сработал только один раз
  const hasOpenedFromUrl = React.useRef(false);

  useEffect(() => {
    // 2. Если уже открывали (true) или данные еще грузятся — стоп, не продолжаем
    if (loading || hasOpenedFromUrl.current || todos.length === 0) return;

    const idParam = searchParams.get('id');
    if (idParam) {
      const targetId = parseInt(idParam);
      const targetTodo = todos.find(t => t.id === targetId);

      if (targetTodo) {
        openEdit(targetTodo);
        
        // 3. Ставим галочку "Мы это уже сделали", чтобы больше не заходить сюда
        hasOpenedFromUrl.current = true;
        
        // Очищаем URL
        window.history.replaceState(null, '', '/tasks');
      }
    }
    // В зависимости добавляем loading, чтобы сработало ровно в момент, когда загрузка закончится
  }, [searchParams, todos, loading]);
  
  // Advanced Form Fields
  const [budget, setBudget] = useState('');
  const [budgetType, setBudgetType] = useState<'income' | 'expense'>('expense');
  const [inputCurrency, setInputCurrency] = useState<'USD' | 'RUB'>('USD');
  const [estimatedTime, setEstimatedTime] = useState('');
  const [recurrence, setRecurrence] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');

  const [tempSubtasks, setTempSubtasks] = useState<{title: string, is_complete: boolean}[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  
  // Project Form
  const [newProjName, setNewProjName] = useState('');
  const [newProjColor, setNewProjColor] = useState(PROJECT_COLORS[5]);

  // Focus State
  const [activeTodoId, setActiveTodoId] = useState<number | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  
  // Unified Modal State
  const [modal, setModal] = useState<{
    isOpen: boolean;
    type: 'finance_confirm' | 'delete_confirm' | 'reset_timer' | 'delete_project';
    data?: any;
    message?: string;
  }>({ isOpen: false, type: 'finance_confirm' });

  // --- Initial Data Load ---
  useEffect(() => { 
    const loadLocal = async () => {
      // Получаем ID текущего пользователя
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      const lTodos = await LocalDB.getAll<Todo>('todos');
      const lProjects = await LocalDB.getAll<Project>('projects');
      
      // ИЗОЛЯЦИЯ: Фильтруем по user_id
      const myTodos = userId ? lTodos.filter(t => t.user_id === userId) : [];
      const myProjects = userId ? lProjects.filter(p => p.user_id === userId) : [];

      // Сортировка
      myTodos.sort((a, b) => (Number(a.is_complete) - Number(b.is_complete)) || (new Date(b['created_at'] || 0).getTime() - new Date(a['created_at'] || 0).getTime()));

      if (myTodos.length > 0) setTodos(myTodos);
      if (myProjects.length > 0) setProjects(myProjects);
      setLoading(false);
    };

    loadLocal();
    fetchRemoteData(); 
  }, []);

  // Проверка очистки "Моего дня"
  useEffect(() => {
    const checkCleanup = () => {
       const settings = SettingsManager.get();
       if (settings.myDayCleanup === 'clear') {
          const lastDate = localStorage.getItem('nexus_last_cleanup');
          const today = new Date().toDateString();
          
          if (lastDate !== today) {
             setTodos(prev => prev.map(t => t.is_my_day ? { ...t, is_my_day: false } : t));
             localStorage.setItem('nexus_last_cleanup', today);
          }
       }
    };
    checkCleanup();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning && view === 'focus') {
      interval = setInterval(() => setTimerSeconds(prev => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, view]);

  // --- Sync Logic (SMART MERGE + ISOLATION) ---
  const fetchRemoteData = async () => {

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    // 2. Загружаем свежие данные из Сети (Supabase вернет только "свои" по RLS)
    const { data: tData } = await supabase
      .from('todos')
      .select('*, subtasks(*)')
      .order('id', { foreignTable: 'subtasks', ascending: true })
      .order('is_complete', { ascending: true })
      .order('inserted_at', { ascending: false });
      
    const { data: pData } = await supabase.from('projects').select('*').order('id');
    
    // 3. УМНОЕ СЛИЯНИЕ
    
    // --- ЗАДАЧИ ---
    if (tData) {
      const currentLocal = await LocalDB.getAll<Todo>('todos');
      
      // Фильтруем: только мои + оффлайновые (id < 0)
      const unsyncedTodos = currentLocal.filter(t => t.id < 0 && t.user_id === userId);
      
      const mergedTodos = [...(tData as Todo[]), ...unsyncedTodos];

      mergedTodos.sort((a, b) => 
        (Number(a.is_complete) - Number(b.is_complete)) || 
        (new Date(b.inserted_at || b.created_at || 0).getTime() - new Date(a.inserted_at || a.created_at || 0).getTime())
      );

      setTodos(mergedTodos);
      
      // В LocalDB храним всё (и своё, и чужое, если есть), но обновляем "свои"
      // Для простоты: читаем всех, убираем старые версии "своих", кладем новые
      // Но LocalDB.put перезаписывает по ID.
      // Чтобы не стереть чужие при переключении аккаунтов, лучше просто сделать put(mergedTodos).
      // Чужие останутся (мы их не трогали в mergedTodos), свои обновятся.
      await LocalDB.put('todos', mergedTodos); 
    }

    // --- ПРОЕКТЫ ---
    if (pData) {
      const currentLocalPrj = await LocalDB.getAll<Project>('projects');
      const unsyncedPrj = currentLocalPrj.filter(p => p.id < 0 && p.user_id === userId);
      
      const mergedPrj = [...(pData as Project[]), ...unsyncedPrj];

      setProjects(mergedPrj);
      await LocalDB.put('projects', mergedPrj);
    }
  };

  // --- Helpers ---
  const formatDurationReadable = (seconds: number) => {
    if (!seconds) return '0с';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}ч ${m}м` : `${m}м ${seconds % 60}с`;
  };

  const formatTimerDigital = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  };

  // --- Core Logic ---

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    // Получаем user_id
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    
    let finalDate = dueDate ? new Date(dueDate).toISOString() : null;
    let finalBudget = budget ? parseFloat(budget) : null;

    const payload = { 
      title, description: desc, priority, due_date: finalDate, project_id: selectedProject, is_my_day: addToMyDay,
      budget: finalBudget, budget_type: budgetType, estimated_time: estimatedTime ? parseInt(estimatedTime) : null, recurrence, 
      currency: inputCurrency
    };

    if (editId) {
      // UPDATE SCENARIO
      const updatedTodo = { ...todos.find(t => t.id === editId)!, ...payload };
      setTodos(todos.map(t => t.id === editId ? updatedTodo : t));
      await LocalDB.put('todos', updatedTodo);

      const { error } = await supabase.from('todos').update(payload).eq('id', editId);
      
      if (error) {
        await LocalDB.addToSyncQueue({ table: 'todos', type: 'UPDATE', payload: updatedTodo });
      } else {
        logEvent('tasks', 'update', `Изменена задача: ${title}`, { id: editId });
      }
    } else {
      // CREATE SCENARIO (OFFLINE + ISOLATION)
      
      const tempId = LocalDB.generateLocalId();
      
      const newTodoLocal = { 
        ...payload, 
        id: tempId, 
        user_id: userId, // <--- ВАЖНО: Добавляем владельца
        inserted_at: new Date().toISOString(),
        is_complete: false, 
        status: 'todo',
        time_spent: 0,
        subtasks: [] 
      };

      // @ts-ignore
      setTodos([newTodoLocal, ...todos]);
      await LocalDB.put('todos', newTodoLocal);

      const { data, error } = await supabase.from('todos').insert([payload]).select().single();

      if (data && !error) {
         const realTodo = { ...newTodoLocal, ...data }; 
         setTodos(prev => prev.map(t => t.id === tempId ? realTodo : t));
         await LocalDB.delete('todos', tempId);
         await LocalDB.put('todos', realTodo);
         logEvent('tasks', 'create', `Создана задача: ${title}`, { id: realTodo.id });
      } else {
         await LocalDB.addToSyncQueue({ table: 'todos', type: 'INSERT', payload: newTodoLocal, tempId });
      }
    }

    await NotificationManager.scheduleAllReminders();
    resetForm();
  };

  const handleCompletion = async (todo: Todo) => {
    // 1. Recurrence Logic
    if (todo.recurrence !== 'none' && !todo.is_complete) {
      await supabase.from('todos').update({ is_complete: true, status: 'done' }).eq('id', todo.id);
      
      let newDate = todo.due_date ? new Date(todo.due_date) : new Date();
      if (todo.recurrence === 'daily') newDate = addDays(newDate, 1);
      if (todo.recurrence === 'weekly') newDate = addWeeks(newDate, 1);
      if (todo.recurrence === 'monthly') newDate = addMonths(newDate, 1);
      
      const { data: newTodo } = await supabase.from('todos').insert([{
        title: todo.title, description: todo.description, priority: todo.priority, project_id: todo.project_id,
        budget: todo.budget, budget_type: todo.budget_type, estimated_time: todo.estimated_time, recurrence: todo.recurrence,
        due_date: newDate.toISOString(), is_my_day: false
      }]).select().single();

      if (newTodo) {
        const todoDone = { ...todo, is_complete: true, status: 'done' as const };
        const todoNew = { ...newTodo, subtasks: [] };
        setTodos(prev => [todoNew, ...prev.map(t => t.id === todo.id ? todoDone : t)]);
        await LocalDB.put('todos', [todoDone, todoNew]);
      }
    } else {
      const newStatus = !todo.is_complete;
      const updatedTodo = { 
        ...todo, 
        is_complete: newStatus, 
        status: newStatus ? 'done' as const : 'todo' as const,
        completed_at: newStatus ? new Date().toISOString() : null // <--- Записываем дату
      };
      
      setTodos(todos.map(t => t.id === todo.id ? updatedTodo : t));
      await LocalDB.put('todos', updatedTodo);
      
      logEvent('tasks', newStatus ? 'complete' : 'restore', `${newStatus ? 'Выполнена' : 'Возобновлена'} задача: ${todo.title}`, { id: todo.id });
      await supabase.from('todos').update({ is_complete: newStatus, status: newStatus ? 'done' : 'todo' }).eq('id', todo.id);
    }

    if (!todo.is_complete && todo.budget && todo.budget > 0) {
      setModal({ isOpen: true, type: 'finance_confirm', data: todo });
    }
  };

  // --- Modal Confirm Actions ---
  const confirmAction = async () => {
    const { type, data } = modal;
    
    if (type === 'finance_confirm') {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      let finalAmount = data.budget;
      if (data.currency === 'USD') {
        finalAmount = data.budget * USD_TO_RUB;
      }

      const txPayload = {
        title: data.title,
        amount: finalAmount,
        type: data.budget_type,
        category: 'other'
      };
      
      const { error } = await supabase.from('transactions').insert([txPayload]);
      
      if (error) {
         const tempId = LocalDB.generateLocalId();
         const localTx = { 
           ...txPayload, 
           id: tempId, 
           user_id: userId, // <--- Добавляем владельца к транзакции
           created_at: new Date().toISOString() 
         };
         await LocalDB.put('transactions', localTx);
         await LocalDB.addToSyncQueue({ table: 'transactions', type: 'INSERT', payload: localTx, tempId });
      }
      alert('✅ Транзакция записана!'); 
    }
    
    if (type === 'delete_confirm') {
      const todoToDelete = todos.find(t => t.id === data);
      if (todoToDelete) logEvent('tasks', 'delete', `Удалена задача: ${todoToDelete.title}`);
      
      setTodos(todos.filter(t => t.id !== data));
      await LocalDB.delete('todos', data);
      
      const { error } = await supabase.from('todos').delete().eq('id', data);
      if (error) {
        await LocalDB.addToSyncQueue({ table: 'todos', type: 'DELETE', payload: { id: data } });
      }
      setView('list');
    }

    if (type === 'reset_timer') {
       const updated = { ...todos.find(t => t.id === data)!, time_spent: 0 };
       setTodos(todos.map(t => t.id === data ? updated : t));
       await LocalDB.put('todos', updated);
       const { error } = await supabase.from('todos').update({ time_spent: 0 }).eq('id', data);
       if(error) await LocalDB.addToSyncQueue({ table: 'todos', type: 'UPDATE', payload: updated });
       setCurrentTimeSpent(0);
    }

    if (type === 'delete_project') {
       setProjects(projects.filter(p => p.id !== data));
       setTodos(todos.map(t => t.project_id === data ? { ...t, project_id: null } : t));
       await LocalDB.delete('projects', data);
       const { error } = await supabase.from('projects').delete().eq('id', data);
       if (error) {
          await LocalDB.addToSyncQueue({ table: 'projects', type: 'DELETE', payload: { id: data } });
       }
    }
    setModal({ isOpen: false, type: 'finance_confirm' });
  };

  // --- Focus Logic ---
  const startFocus = async (t: Todo) => {
    setActiveTodoId(t.id);
      const settings = SettingsManager.get();
      const planMinutes = t.estimated_time || settings.pomodoroDuration || 25;
      const planSeconds = planMinutes * 60;
      const alreadySpent = t.time_spent || 0;
      const remaining = planSeconds - alreadySpent;

      setTimerSeconds(alreadySpent); // Начинаем с того, где остановились
      setIsTimerRunning(true);

      // Если цель еще не достигнута, ставим уведомление
      if (remaining > 0) {
        NotificationManager.scheduleFocus(remaining);
      }
    const updated = { ...t, status: 'in_progress' as const };

    setTodos(prev => prev.map(item => item.id === t.id ? updated : item));

    await LocalDB.put('todos', updated);
    await supabase.from('todos').update({ status: 'in_progress' }).eq('id', t.id);

    setView('focus');
  };

  const stopFocus = async (markComplete: boolean = false) => {
    NotificationManager.cancelFocus();
    setIsTimerRunning(false);
    if (view === 'focus') {
       NotificationManager.send('Фокус завершен', `Сессия окончена! Время: ${formatDurationReadable(timerSeconds)}`);
    }
    const newSpent = timerSeconds;
    const finalStatus = markComplete ? 'done' : 'paused';
    
    if (activeTodoId) {
       const todo = todos.find(t => t.id === activeTodoId);
       if (todo) {
          const updated = { ...todo, time_spent: newSpent, is_complete: markComplete, status: finalStatus as any };
          if (markComplete) {
            handleCompletion(updated); 
          } else {
            setTodos(todos.map(t => t.id === activeTodoId ? updated : t));
            await LocalDB.put('todos', updated);
            await supabase.from('todos').update({ time_spent: newSpent, status: 'paused' }).eq('id', activeTodoId);
          }
       }
    }
    setActiveTodoId(null);
    setView('list');
  };

  // --- Project Mgmt ---
  const handleCreateProject = async () => {
    if (!newProjName) return;
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // Сразу генерируем локальный объект с user_id
    const tempId = LocalDB.generateLocalId();
    const localProj = { 
        id: tempId, 
        name: newProjName, 
        color: newProjColor, 
        user_id: userId // <--- ВАЖНО
    };

    // UI Optimistic
    setProjects([...projects, localProj]); 
    await LocalDB.put('projects', localProj);

    const { data, error } = await supabase.from('projects').insert([{ name: newProjName, color: newProjColor }]).select().single();
    
    if (data && !error) { 
        // Swap
        setProjects(prev => prev.map(p => p.id === tempId ? data : p));
        await LocalDB.delete('projects', tempId);
        await LocalDB.put('projects', data);
    } else {
        // Queue
        await LocalDB.addToSyncQueue({ table: 'projects', type: 'INSERT', payload: localProj, tempId });
    }
    setNewProjName(''); 
  };

  // --- UI Helpers ---
  const openEdit = (t: Todo) => {
    setEditId(t.id); setTitle(t.title); setDesc(t.description || ''); setPriority(t.priority);
    setSelectedProject(t.project_id); setAddToMyDay(t.is_my_day); setCurrentTimeSpent(t.time_spent || 0);
    setBudget(t.budget ? t.budget.toString() : '');
    setBudgetType(t.budget_type || 'expense');
    setEstimatedTime(t.estimated_time ? t.estimated_time.toString() : '');
    setRecurrence(t.recurrence);
    setInputCurrency(t.currency || 'RUB');
    if (t.due_date) {
      const d = new Date(t.due_date);
      setDueDate(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    } else setDueDate('');
    setTempSubtasks([]); setView('form');
  };

  const resetForm = () => {
    setEditId(null); setTitle(''); setDesc(''); setPriority('medium'); setDueDate(''); setSelectedProject(null); 
    setAddToMyDay(filter === 'my_day'); setTempSubtasks([]); setCurrentTimeSpent(0); 
    setBudget(''); setEstimatedTime(''); setRecurrence('none'); setBudgetType('expense');
    setView('list');
  };

  // Удаление подзадачи
  const deleteSubtask = async (subTaskId: number) => {
    const todo = todos.find(t => t.id === editId);
    if (!todo) return;

    // 1. Оптимистичное удаление (сразу убираем из списка)
    const updatedSubtasks = (todo.subtasks || []).filter(s => s.id !== subTaskId);
    const updatedTodo = { ...todo, subtasks: updatedSubtasks };

    setTodos(prev => prev.map(t => t.id === editId ? updatedTodo : t));
    await LocalDB.put('todos', updatedTodo);

    // 2. Удаляем с сервера (только если это реальная подзадача с положительным ID)
    if (subTaskId > 0) {
       const { error } = await supabase.from('subtasks').delete().eq('id', subTaskId);
       if (error) console.error('Ошибка удаления подзадачи:', error);
    }
  };

  // Функция для переключения галочки подзадачи
  const toggleSubtask = async (subTaskId: number) => {
    const todo = todos.find(t => t.id === editId);
    if (!todo) return;

    // 1. Локальное переключение
    const updatedSubtasks = (todo.subtasks || []).map(s => 
      s.id === subTaskId ? { ...s, is_complete: !s.is_complete } : s
    );  
    const updatedTodo = { ...todo, subtasks: updatedSubtasks };

    // Обновляем UI и локальную базу
    setTodos(prev => prev.map(t => t.id === editId ? updatedTodo : t));
    await LocalDB.put('todos', updatedTodo);

    // 2. Отправка на сервер
    // Отправляем запрос только если ID положительный (значит задача уже есть в базе)
    if (subTaskId > 0) {
        const newState = updatedSubtasks.find(s => s.id === subTaskId)?.is_complete;
        
        const { error } = await supabase
            .from('subtasks')
            .update({ is_complete: newState })
            .eq('id', subTaskId);
            
        if (error) {
            console.error('Ошибка обновления статуса подзадачи:', error);
        }
    }
  };

  const addQuickSubtask = async () => {
    if (!newSubtaskTitle || !editId) return;

    const todo = todos.find(t => t.id === editId);
    if (!todo) return;

    // 1. Оптимистичное обновление (показываем мгновенно)
    const tempId = -Math.floor(Math.random() * 1000000000); 
    
    const newSubtask = { 
        id: tempId, 
        title: newSubtaskTitle, 
        is_complete: false, 
        todo_id: editId,
        user_id: null 
    };
    
    // Защита от пустого массива (|| [])
    const optimisticSubtasks = [...(todo.subtasks || []), newSubtask];
    const optimisticTodo = { ...todo, subtasks: optimisticSubtasks };

    // Сохраняем локально сразу же
    setTodos(prev => prev.map(t => t.id === editId ? optimisticTodo : t));
    await LocalDB.put('todos', optimisticTodo);
    setNewSubtaskTitle('');

    // 2. Отправляем в Supabase ТОЛЬКО если родительская задача уже есть на сервере
    // (то есть у неё положительный ID)
    if (editId > 0) {
        const payload = { 
            todo_id: editId, 
            title: newSubtask.title,
            is_complete: false
        };

        const { data, error } = await supabase
            .from('subtasks')
            .insert([payload])
            .select()
            .single();

        if (error) {
            console.error('Ошибка сохранения подзадачи (Server):', error);
            // Мы не удаляем задачу локально, чтобы данные не пропали.
            // При следующем обновлении страницы или синхронизации она попытается улететь снова.
            return;
        }

        // 3. Если успех - подменяем временный ID на реальный
        if (data) { 
           const realSubtasks = optimisticSubtasks.map(s => s.id === tempId ? data : s);
           const finalTodo = { ...optimisticTodo, subtasks: realSubtasks };
           
           setTodos(prev => prev.map(t => t.id === editId ? finalTodo : t));
           await LocalDB.put('todos', finalTodo);
        }
    } else {
        console.log('Родительская задача локальная (ID < 0). Подзадача сохранена только в LocalDB.');
    }
  };

  const filteredTodos = todos.filter(t => {
    const settings = SettingsManager.get();
    // Если включена авто-архивация, задача выполнена И есть дата завершения
    if (settings.autoArchiveTasks && t.is_complete && t.completed_at) {
        const doneDate = new Date(t.completed_at);
        const diffHours = (new Date().getTime() - doneDate.getTime()) / (1000 * 60 * 60);
        if (diffHours > 24) return false; // Скрываем из списка
    }
    if (filter === 'my_day') return t.is_my_day;
    if (filter === 'all') return true;
    return t.project_id === filter;
  });

  // --- Android Back Button Logic ---
  useEffect(() => {
    const handleBackButton = async () => {
      // 1. Уровень "Вложенность": Модалки
      if (modal.isOpen) {
        setModal(prev => ({ ...prev, isOpen: false }));
        return;
      }

      // 2. Уровень "Вложенность": Фокус, Форма, Проекты
      if (view === 'focus') {
        stopFocus(false);
        return;
      }
      if (view === 'form') {
        resetForm();
        return;
      }
      if (view === 'projects') {
        setView('list');
        return;
      }

      // 3. Уровень "Главная страница сервиса" (Список задач)
      if (view === 'list') {
        router.push('/');
      }
    };

    const backButtonListener = App.addListener('backButton', handleBackButton);
    return () => {
      backButtonListener.then(listener => listener.remove());
    };
  }, [view, modal.isOpen]);

  // --- RENDER ---
  if (view === 'focus' && activeTodoId) {
    const activeTodo = todos.find(t => t.id === activeTodoId);
    return (
      <div className="w-full h-full flex flex-col items-center justify-center animate-in zoom-in duration-300 relative">
        <button onClick={() => stopFocus(false)} className="absolute top-0 right-0 m-4 text-neutral-500 hover:text-white bg-neutral-800 p-2 rounded-full"><X size={24}/></button>
        <div className="mb-8 p-4 bg-indigo-500/10 rounded-full animate-pulse"><Timer size={48} className="text-indigo-400" /></div>
        <h2 className="text-2xl font-light text-white text-center mb-2 px-8">{activeTodo?.title}</h2>
        <div className="text-neutral-500 text-sm mb-10 flex gap-2 items-center">
          {activeTodo?.project_id ? projects.find(p => p.id === activeTodo.project_id)?.name : 'Фокус'}
          <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 text-xs">В РАБОТЕ</span>
        </div>
        <div className="text-7xl font-mono font-bold text-white tracking-widest mb-12 tabular-nums">{formatTimerDigital(timerSeconds)}</div>
        <div className="flex gap-6">
           <button onClick={() => setIsTimerRunning(!isTimerRunning)} className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center hover:bg-neutral-700 transition">{isTimerRunning ? <Pause size={24} className="text-white"/> : <Play size={24} className="text-white ml-1"/>}</button>
           <button onClick={() => stopFocus(true)} className="w-16 h-16 rounded-full bg-emerald-600 flex items-center justify-center hover:bg-emerald-500 transition shadow-lg shadow-emerald-500/20"><Check size={28} className="text-white" /></button>
        </div>
      </div>
    );
  }

  if (view === 'projects') {
    return (
      <div className="w-full h-full flex flex-col animate-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-light text-white">Проекты</h3>
          <button onClick={() => setView('list')} className="text-neutral-500 hover:text-white"><X size={20}/></button>
        </div>
        <div className="mb-8 bg-neutral-900/50 p-4 rounded-2xl border border-white/5">
           <input value={newProjName} onChange={e => setNewProjName(e.target.value)} placeholder="Название проекта" className="bg-transparent text-lg font-medium border-b border-white/10 pb-2 focus:outline-none focus:border-indigo-500 w-full mb-4" />
           <div className="flex gap-3 mb-4">
             {PROJECT_COLORS.map(c => (<button key={c} onClick={() => setNewProjColor(c)} className={`w-6 h-6 rounded-full transition ${newProjColor === c ? 'ring-2 ring-white scale-110' : 'opacity-50 hover:opacity-100'}`} style={{ backgroundColor: c }} />))}
           </div>
           <button onClick={handleCreateProject} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-xl">Создать</button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
           {projects.map(p => (
             <div key={p.id} className="flex items-center justify-between p-3 bg-neutral-900 rounded-xl border border-white/5">
                <div className="flex items-center gap-3"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} /><span className="text-neutral-200">{p.name}</span></div>
                <button onClick={() => setModal({isOpen:true, type:'delete_project', data:p.id, message: `Удалить проект "${p.name}"?`})} className="p-2 text-neutral-600 hover:text-rose-500 rounded-lg transition"><Trash2 size={16}/></button>
             </div>
           ))}
        </div>
      </div>
    )
  }

  if (view === 'form') {
    return (
      <div className="w-full h-full flex flex-col animate-in fade-in zoom-in duration-200 overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-light text-white">{editId ? 'Редактирование' : 'Новая задача'}</h3>
          <button onClick={resetForm} className="text-neutral-500 hover:text-white"><X size={20}/></button>
        </div>
        <form onSubmit={handleSave} className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-2">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Суть задачи..." className="bg-transparent text-xl font-medium border-b border-white/10 pb-2 focus:outline-none focus:border-indigo-500 w-full" autoFocus />
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide shrink-0">
            <button type="button" onClick={() => setAddToMyDay(!addToMyDay)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition shrink-0 ${addToMyDay ? 'bg-amber-500/20 text-amber-500 border border-amber-500/50' : 'bg-neutral-900 border border-white/10 text-neutral-400'}`}><Sun size={14} /> {addToMyDay ? 'В планах' : 'В день'}</button>
            <div className="relative shrink-0"><input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} className="bg-neutral-900 border border-white/10 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none h-full" /></div>
            <select value={selectedProject || ''} onChange={e => setSelectedProject(e.target.value ? Number(e.target.value) : null)} className="bg-neutral-900 border border-white/10 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none shrink-0">
               <option value="">Без проекта</option>
               {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="flex bg-neutral-900 rounded-lg p-1 border border-white/10 shrink-0">
              {(['low', 'medium', 'high'] as const).map(p => (<button key={p} type="button" onClick={() => setPriority(p)} className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${priority === p ? `${PRIORITIES[p].bg} ${PRIORITIES[p].text}` : 'text-neutral-500'}`}>{PRIORITIES[p].label}</button>))}
            </div>
          </div>
          
          {/* ADVANCED: FINANCE & TIME */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
             {/* FINANCE BLOCK */}
             <div className="bg-neutral-900/50 border border-white/10 rounded-xl p-2 flex flex-col gap-2">
                <div className="flex gap-1">
                   <button type="button" onClick={() => setBudgetType('expense')} className={`flex-1 py-1 rounded text-[10px] font-bold ${budgetType === 'expense' ? 'bg-rose-500/20 text-rose-400' : 'text-neutral-500 hover:text-white'}`}>ТРАТА</button>
                   <button type="button" onClick={() => setBudgetType('income')} className={`flex-1 py-1 rounded text-[10px] font-bold ${budgetType === 'income' ? 'bg-emerald-500/20 text-emerald-400' : 'text-neutral-500 hover:text-white'}`}>ДОХОД</button>
                </div>
                <div className="flex items-center gap-2 relative">
                   <Banknote size={16} className={budgetType === 'income' ? 'text-emerald-500' : 'text-rose-500'} />
                   <input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0.00" className="bg-transparent text-sm text-white w-full focus:outline-none" />
                   <button type="button" onClick={() => setInputCurrency(c => c === 'USD' ? 'RUB' : 'USD')} className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-neutral-300 hover:text-white">{inputCurrency}</button>
                </div>
             </div>
             
             {/* TIME BLOCK */}
             <div className="bg-neutral-900/50 border border-white/10 rounded-xl p-2 flex flex-col gap-2 justify-center">
                 <div className="flex items-center gap-2 px-1">
                    <Clock size={16} className="text-indigo-500" />
                    <input type="number" value={estimatedTime} onChange={e => setEstimatedTime(e.target.value)} placeholder="План (мин)" className="bg-transparent text-sm text-white w-full focus:outline-none" />
                 </div>
                 <div className="flex items-center gap-2 px-1">
                    <Repeat size={16} className="text-amber-500" />
                    <select value={recurrence} onChange={e => setRecurrence(e.target.value as any)} className="bg-transparent text-xs text-neutral-300 w-full focus:outline-none appearance-none">
                      <option value="none">Без повтора</option>
                      <option value="daily">Ежедневно</option>
                      <option value="weekly">Еженедельно</option>
                      <option value="monthly">Ежемесячно</option>
                    </select>
                 </div>
             </div>
          </div>

          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Заметки..." className="w-full bg-neutral-900/50 border border-white/10 rounded-xl p-3 text-sm text-neutral-300 focus:outline-none focus:border-indigo-500 min-h-[80px]" />

          {editId && (
            <div className="bg-neutral-900/50 border border-white/5 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2"><Timer size={16} className="text-indigo-400"/><span className="text-sm text-neutral-300">Факт: <span className="font-mono text-white">{formatDurationReadable(currentTimeSpent)}</span></span></div>
              <button type="button" onClick={() => setModal({isOpen:true, type:'reset_timer', data: editId, message: 'Сбросить таймер?'})} className="text-xs bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white px-2 py-1 rounded transition flex items-center gap-1"><RotateCcw size={10} /> Сброс</button>
            </div>
          )}

          {editId && (
            <div className="mt-2">
              <div className="text-xs text-neutral-500 font-bold uppercase mb-2">Чек-лист</div>
              <div className="space-y-2 mb-3">
                {/* ИСПРАВЛЕНИЕ: Добавлен знак вопроса перед .map и защита || [] */}
                {/* СПИСОК ПОДЗАДАЧ С УДАЛЕНИЕМ */}
            <div className="space-y-2 mb-3">
                {(todos.find(t => t.id === editId)?.subtasks || []).map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-2 group min-h-[28px]">
                    
                    {/* Левая часть: Кликабельная галочка и текст */}
                    <div 
                      className="flex items-center gap-2 text-sm cursor-pointer flex-1 py-1" 
                      onClick={() => toggleSubtask(s.id)}
                    >
                      <div className={`w-4 h-4 border rounded flex items-center justify-center transition shrink-0 ${s.is_complete ? 'bg-indigo-600 border-indigo-600' : 'border-neutral-600 hover:border-indigo-500'}`}>
                        <Check size={10} className={`text-white ${s.is_complete ? 'block' : 'hidden'}`} />
                      </div>
                      <span className={`transition break-all ${s.is_complete ? 'text-neutral-500 line-through' : 'text-neutral-300'}`}>
                        {s.title}
                      </span>
                    </div>

                    {/* Правая часть: Кнопка удаления (появляется при наведении или всегда на телефоне) */}
                    <button 
                      type="button" 
                      onClick={(e) => { 
                        e.stopPropagation(); // Чтобы не сработал клик по задаче
                        deleteSubtask(s.id); 
                      }}
                      className="text-neutral-600 hover:text-rose-500 p-1.5 rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 transition shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
            </div>
              </div>
              <div className="flex gap-2"><input value={newSubtaskTitle} onChange={e => setNewSubtaskTitle(e.target.value)} placeholder="Добавить пункт..." className="flex-1 bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addQuickSubtask(); }}} /><button type="button" onClick={addQuickSubtask} className="bg-white/5 hover:bg-white/10 p-2 rounded-lg text-white"><Plus size={18}/></button></div>
            </div>
          )}
          <div className="flex-1"></div>
          <div className="flex gap-3">
             {editId && (<button type="button" onClick={() => setModal({isOpen:true, type:'delete_confirm', data: editId, message: 'Удалить задачу безвозвратно?'})} className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 p-3 rounded-xl transition flex-shrink-0"><Trash2 size={20}/></button>)}
             <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-xl transition">Сохранить</button>
          </div>
        </form>
        {/* UNIFIED MODAL FOR FORM */}
        {modal.isOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
             <div className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-4/5 max-w-sm shadow-2xl scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-center text-amber-500 mb-4"><AlertTriangle size={32} /></div>
                <h3 className="text-center text-white font-medium text-lg mb-2">Подтвердите действие</h3>
                <p className="text-center text-sm text-neutral-400 mb-6">{modal.message || 'Вы уверены?'}</p>
                <div className="flex gap-3">
                   <button type="button" onClick={() => setModal({ ...modal, isOpen: false })} className="flex-1 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm transition">Отмена</button>
                   <button type="button" onClick={confirmAction} className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition">Подтвердить</button>
                </div>
             </div>
          </div>
        )}

      </div>
    );
  }

  // 4. LIST VIEW
  return (
    <div className="w-full h-full flex flex-col relative">
      <div className="flex justify-between items-center mb-4">
        <div>
           <h3 className="text-xl font-light text-white">{filter === 'my_day' ? 'Мой день' : filter === 'all' ? 'Все задачи' : projects.find(p => p.id === filter)?.name}</h3>
           <p className="text-xs text-neutral-500">{filteredTodos.filter(t => !t.is_complete).length} активных</p>
        </div>
        <div className="flex gap-2">
           <button onClick={() => setView('projects')} className="bg-neutral-800 hover:bg-neutral-700 text-white p-2 rounded-lg transition" title="Проекты"><Layers size={20} /></button>
           <button onClick={() => setView('form')} className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg transition shadow-lg"><Plus size={20} /></button>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-hide">
        <button onClick={() => setFilter('my_day')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${filter === 'my_day' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-neutral-900 text-neutral-500 border border-white/5 hover:bg-neutral-800'}`}><Sun size={14} /> День</button>
        <button onClick={() => setFilter('all')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${filter === 'all' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-neutral-900 text-neutral-500 border border-white/5 hover:bg-neutral-800'}`}><Layers size={14} /> Все</button>
        {projects.map(p => (<button key={p.id} onClick={() => setFilter(p.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${filter === p.id ? 'bg-white/10 text-white border border-white/20' : 'bg-neutral-900 text-neutral-500 border border-white/5 hover:bg-neutral-800'}`}><div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} /> {p.name}</button>))}
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
        {filteredTodos.map((todo) => {
          const project = projects.find(p => p.id === todo.project_id);
          const isRecurring = todo.recurrence !== 'none';
          return (
            <div key={todo.id} onClick={() => openEdit(todo)} className={`group relative p-3 rounded-2xl border transition-all cursor-pointer hover:bg-neutral-900 ${todo.is_complete ? 'bg-neutral-900/30 border-transparent opacity-50' : 'bg-neutral-900/40 border-white/5 hover:border-indigo-500/30'}`}>
              <div className="flex items-start gap-3">
                <button onClick={(e) => { e.stopPropagation(); handleCompletion(todo); }} className={`mt-0.5 shrink-0 w-5 h-5 rounded-md flex items-center justify-center border transition ${todo.is_complete ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'border-neutral-600 hover:border-indigo-500 text-transparent'}`}>{todo.is_complete ? <Check size={14} strokeWidth={3} /> : (isRecurring && <Repeat size={10} className="text-neutral-500"/>)}</button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-medium truncate ${todo.is_complete ? 'line-through text-neutral-500' : 'text-neutral-200'}`}>{todo.title}</span>
                    <div className={`w-1.5 h-1.5 rounded-full ${PRIORITIES[todo.priority].dot}`} />
                    {project && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-neutral-400 border border-white/5" style={{ color: project.color }}>{project.name}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-neutral-500">
                    {todo.status === 'in_progress' && <span className="text-indigo-400 font-bold animate-pulse">В РАБОТЕ</span>}
                    {todo.due_date && (<div className={`flex items-center gap-1 ${new Date(todo.due_date) < new Date() && !todo.is_complete ? 'text-rose-400' : ''}`}><Clock size={12} /><span>{format(new Date(todo.due_date), 'dd MMM', { locale: ru })}</span></div>)}
                    {todo.time_spent > 0 && (<div className="flex items-center gap-1 text-emerald-400 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded"><Timer size={10} /><span>{formatDurationReadable(todo.time_spent)}</span></div>)}
                    {todo.budget && <div className={`flex items-center gap-1 ${todo.budget_type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    <Banknote size={12}/> 
                    {/* Если валюта USD показываем $, иначе ₽ */}
                    {todo.currency === 'USD' ? '$' : '₽'} {todo.budget}
                  </div>}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition">
                   {!todo.is_complete && (<button onClick={(e) => { e.stopPropagation(); startFocus(todo); }} className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg"><Play size={14} fill="currentColor" /></button>)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* UNIFIED MODAL */}
      {modal.isOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
           <div className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-4/5 max-w-sm shadow-2xl scale-100 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto custom-scrollbar">
              <div className="flex justify-center text-amber-500 mb-4"><AlertTriangle size={32} /></div>
              <h3 className="text-center text-white font-medium text-lg mb-2">Подтвердите действие</h3>
              <p className="text-center text-sm text-neutral-400 mb-6">{modal.message || (modal.type === 'finance_confirm' ? `Записать сумму ${modal.data.budget} ₽ в финансы (${modal.data.budget_type === 'income' ? 'Доход' : 'Расход'})?` : 'Вы уверены?')}</p>              <div className="flex gap-3">
                 <button onClick={() => setModal({ ...modal, isOpen: false })} className="flex-1 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm transition">Отмена</button>
                 <button onClick={confirmAction} className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition">Подтвердить</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}