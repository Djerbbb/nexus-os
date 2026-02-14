"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { 
  Folder, FileText, Plus, Trash2, Save, 
  Edit3, Eye, Search, Share2, ChevronRight, ChevronDown, 
  Link as LinkIcon, Star, Download, FilePlus, HelpCircle, X, File,
  Image as ImageIcon, Info, AlertTriangle, CheckCircle, Lightbulb, 
  LayoutGrid, Calendar, CheckSquare, Clock, Coins, Link2, Unlink, ArrowLeft,
  MoreVertical, Loader2
} from 'lucide-react';

// --- Imports for Infinite Canvas ---
import '@xyflow/react/dist/style.css';
import { 
  ReactFlow, Background, Controls, MiniMap, 
  useNodesState, useEdgesState, MarkerType, 
  Node, Edge, Connection, addEdge
} from '@xyflow/react';
import { useDevice } from '@/lib/device';
import { logEvent } from '@/lib/log';
import { LocalDB } from '@/lib/db';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { App as CapApp } from '@capacitor/app';
import { SettingsManager } from '@/lib/settings';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

// --- Types ---
type FolderType = { id: number; user_id?: string; name: string; is_favorite: boolean; };
type NoteType = { 
  id: number;
  user_id?: string;
  title: string; 
  content: string; 
  folder_id: number | null; 
  is_favorite: boolean;
  updated_at: string; 
  canvas_x?: number; 
  canvas_y?: number;
  isUnsaved?: boolean;
};
type LinkType = { id?: number; source_id: number; target_id: number; };

// --- Templates ---
const TEMPLATES = [
  { name: 'Пустая заметка', content: '' },
  { name: 'Ежедневный журнал', content: '# 📅 Ежедневный отчет\n\n**Дата:** \n\n### ✅ Главные задачи\n- [ ] \n- [ ] \n\n### 🧠 Мысли и идеи\n\n### 📉 Итоги дня\n' },
  { name: 'Встреча / Call', content: '# 👥 Заметка о встрече\n\n**Участники:** \n**Дата:** \n\n### 📝 Обсуждали\n\n### 🚀 Итоги и решения\n1. \n2. \n' },
];

// --- Helper Component: Finance Chip ---
const FinanceChip = ({ category }: { category: string }) => {
  const [amount, setAmount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFinance = async () => {
      const { data } = await supabase
        .from('transactions')
        .select('amount')
        .eq('category', category);
      
      if (data) {
        const sum = data.reduce((acc, curr) => acc + Number(curr.amount), 0);
        setAmount(sum);
      }
      setLoading(false);
    };
    fetchFinance();
  }, [category]);

  if (loading) return <span className="inline-flex items-center px-2 py-0.5 rounded bg-neutral-800 text-xs text-neutral-500 animate-pulse">...</span>;

  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium text-xs select-none cursor-default">
      <Coins size={12} />
      <span>{category}:</span>
      {/* FIX: Принудительное форматирование в Рублях */}
      <span className="text-white">
        {amount?.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0 })}
      </span>
    </span>
  );
};

export default function BrainWidget() {
  const router = useRouter();
  const { isTouch } = useDevice();
  // Data
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [notes, setNotes] = useState<NoteType[]>([]);
  const [links, setLinks] = useState<LinkType[]>([]);
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null); // Таймер
  const [autosaveEnabled, setAutosaveEnabled] = useState(true); // Локальный стейт настройки

  const searchParams = useSearchParams();

  useEffect(() => {
    const idParam = searchParams.get('id');
    if (idParam && notes.length > 0) {
      const targetId = parseInt(idParam);
      const targetNote = notes.find(n => n.id === targetId);

      if (targetNote) {
        setSelectedNoteId(targetNote.id);
        setViewMode('edit');
        window.history.replaceState(null, '', '/brain');
      }
    }
  }, [searchParams, notes]);
  
  // UI
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'graph' | 'canvas'>('edit');
  const [expandedFolders, setExpandedFolders] = useState<Record<number, boolean>>({});
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  // Create State
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [linkedTasks, setLinkedTasks] = useState<any[]>([]); // Задачи, привязанные к заметке
  const [showLinkTaskMenu, setShowLinkTaskMenu] = useState(false); // Меню привязки
  const [allTasks, setAllTasks] = useState<any[]>([]); // Для выбора задач
  const [showMoveMenu, setShowMoveMenu] = useState(false); // Для меню перемещения
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [mobileMenuMode, setMobileMenuMode] = useState<'main' | 'folders'>('main');
  const [isSaving, setIsSaving] = useState(false); // Только для спиннера
  const dateInputRef = useRef<HTMLInputElement>(null); // Ссылка на календарь
  const isMobileContentOpen = selectedNoteId !== null || viewMode === 'graph' || viewMode === 'canvas';

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 2. Функция вставки сниппета из справки
  const handleInsertSnippet = (textToInsert: string) => {
    if (!activeNote) return;

    // Закрываем справку, чтобы пользователь увидел результат
    setShowHelp(false);

    let newContent = activeNote.content;
    let cursorPosition = activeNote.content.length; // По дефолту в конец

    // Если есть доступ к полю ввода, вставляем в место курсора
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      newContent = activeNote.content.substring(0, start) + textToInsert + activeNote.content.substring(end);
      cursorPosition = start + textToInsert.length;
    } else {
      // Иначе просто добавляем в конец
      newContent += '\n' + textToInsert;
    }

    // Обновляем состояние
    setNotes(notes.map(n => n.id === activeNote.id ? { ...n, content: newContent, isUnsaved: true } : n));

    // Возвращаем фокус на поле ввода (с небольшой задержкой)
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
      }
    }, 100);
  };

  // --- CANVAS STATE & LOGIC ---
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Синхронизация данных при переключении на Canvas
  useEffect(() => {
    // @ts-ignore (игнорируем ошибку типизации viewMode, если она есть)
    if (viewMode === 'canvas') {
      const newNodes: Node[] = notes.map((n, index) => {
        // Если координат нет (0,0), выстраиваем сеткой
        let x = n.canvas_x || 0;
        let y = n.canvas_y || 0;
        
        if (x === 0 && y === 0) {
           const col = index % 5;
           const row = Math.floor(index / 5);
           x = col * 250;
           y = row * 200;
        }

        return {
          id: n.id.toString(),
          position: { x, y },
          data: { label: n.title },
          style: { 
            background: '#171717', color: '#fff', 
            border: n.is_favorite ? '1px solid #f59e0b' : '1px solid #333',
            borderRadius: '12px', padding: '10px', width: 180, fontSize: '12px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
          },
        };
      });

      const newEdges: Edge[] = links.map(l => ({
        id: `e${l.source_id}-${l.target_id}`,
        source: l.source_id.toString(),
        target: l.target_id.toString(),
        type: 'smoothstep',
        style: { stroke: '#4f46e5' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#4f46e5' },
      }));

      setRfNodes(newNodes);
      setRfEdges(newEdges);
    }
  }, [viewMode, notes, links, setRfNodes, setRfEdges]);

  // Сохранение координат после перетаскивания
  // @ts-ignore
  const onNodeDragStop = async (_: React.MouseEvent, node: Node) => {
    const id = parseInt(node.id);
    const x = node.position.x;
    const y = node.position.y;
    // Обновляем локально и в базе
    setNotes((prev) => prev.map(n => n.id === id ? { ...n, canvas_x: x, canvas_y: y } : n));
    await supabase.from('notes').update({ canvas_x: x, canvas_y: y }).eq('id', id);
  };

  // Двойной клик открывает заметку
  // @ts-ignore
  const onNodeDoubleClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNoteId(parseInt(node.id));
    setViewMode('edit');
  };

  // Derived
  const activeNote = notes.find(n => n.id === selectedNoteId);

  // --- Initial Fetch ---
  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    if (!showMobileMenu) setMobileMenuMode('main');
  }, [showMobileMenu]);
  // Загрузка связанных задач при выборе заметки
  useEffect(() => {
    const fetchLinkedTasks = async () => {
      if (!selectedNoteId) {
        setLinkedTasks([]);
        return;
      }
      const { data } = await supabase.from('todos').select('*').eq('note_id', selectedNoteId);
      if (data) setLinkedTasks(data);
    };
    fetchLinkedTasks();
  }, [selectedNoteId]);

  useEffect(() => {
     const s = SettingsManager.get();
     setAutosaveEnabled(s.noteAutosave);
     // Размер шрифта применяется глобально через CSS переменную, 
     // но мы можем обновить её при маунте для надежности
     SettingsManager.applyTheme(s);
     
     fetchData();
  }, []);

  // Функция привязки задачи к текущей заметке
  const handleLinkTask = async (taskId: number) => {
    if (!activeNote) return;
    await supabase.from('todos').update({ note_id: activeNote.id }).eq('id', taskId);
    // Обновляем список
    const { data } = await supabase.from('todos').select('*').eq('id', taskId).single();
    if (data) setLinkedTasks(prev => [...prev, data]);
    setShowLinkTaskMenu(false);
  };

  // --- НОВАЯ ФУНКЦИЯ: Создать и привязать задачу ---
  const handleCreateAndLinkTask = async (taskTitle: string) => {
    if (!activeNote || !taskTitle.trim()) return;

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const payload = {
      title: taskTitle,
      user_id: userId,
      note_id: activeNote.id, // Сразу привязываем
      status: 'todo', // Статус "Сделать"
      priority: 'medium',
      is_my_day: false
    };

    // Вставляем и сразу получаем результат
    const { data, error } = await supabase.from('todos').insert([payload]).select().single();
    
    if (data && !error) {
       // Обновляем список задач в интерфейсе мгновенно
       setLinkedTasks(prev => [...prev, data]);
       logEvent('tasks', 'create', `Создана задача из заметки: ${taskTitle}`, { id: data.id });
    }
  };
  
  // Функция отвязки
  const handleUnlinkTask = async (taskId: number) => {
    await supabase.from('todos').update({ note_id: null }).eq('id', taskId);
    setLinkedTasks(prev => prev.filter(t => t.id !== taskId));
  };
  
// Загрузка всех задач для меню выбора
  const loadAllTasks = async () => {
    // FIX: Сортируем по ID (он точно есть), чтобы избежать ошибки 400 из-за отсутствия created_at
    const { data, error } = await supabase
      .from('todos')
      .select('id, title')
      .order('id', { ascending: false }) 
      .limit(50);
      
    if (error) {
      console.error('Ошибка загрузки задач:', error);
      alert('Не удалось загрузить задачи. Проверь консоль.');
      return;
    }

    if (data) setAllTasks(data);
    setShowLinkTaskMenu(true);
  };

  const fetchData = async () => {
    // 0. Получаем ID текущего пользователя
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // 1. ГРУЗИМ ЛОКАЛЬНЫЕ ДАННЫЕ (Мгновенно)
    const lFolders = await LocalDB.getAll<FolderType>('folders');
    const lNotes = await LocalDB.getAll<NoteType>('notes');
    const lLinks = await LocalDB.getAll<LinkType>('note_links');

    // ФИЛЬТРАЦИЯ: Оставляем только свои
    const myFolders = userId ? lFolders.filter(f => f.user_id === userId) : [];
    const myNotes = userId ? lNotes.filter(n => n.user_id === userId) : [];
    const myLinks = userId ? lLinks.filter(l => (l as any).user_id === userId) : [];

    if (myFolders.length > 0) {
      setFolders(myFolders.sort((a, b) => a.name.localeCompare(b.name)));
      const expandState: Record<number, boolean> = {};
      myFolders.forEach(f => expandState[f.id] = true);
      setExpandedFolders(prev => ({ ...expandState, ...prev }));
    }
    
    if (myNotes.length > 0) {
      setNotes(myNotes.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
    }
    if (myLinks.length > 0) setLinks(myLinks);

    // 2. ЗАПРОС К СЕРВЕРУ (Если мы онлайн)
    if (!userId) return;

    const { data: fData } = await supabase.from('folders').select('*').order('name');
    const { data: nData } = await supabase.from('notes').select('*').order('updated_at', { ascending: false });
    const { data: lData } = await supabase.from('note_links').select('*');
    
    // 3. УМНОЕ СЛИЯНИЕ (SMART MERGE)
    
    // Папки
    if (fData) {
      const currentLocalFolders = await LocalDB.getAll<FolderType>('folders');
      // Берем оффлайновые (id < 0) И принадлежащие текущему юзеру
      const unsyncedFolders = currentLocalFolders.filter(f => f.id < 0 && f.user_id === userId);
      const mergedFolders = [...fData, ...unsyncedFolders];
      
      setFolders(mergedFolders);
      await LocalDB.put('folders', mergedFolders);
    }

    // Заметки
    if (nData) {
      const currentLocalNotes = await LocalDB.getAll<NoteType>('notes');
      const unsyncedNotes = currentLocalNotes.filter(n => n.id < 0 && n.user_id === userId);
      
      const mergedNotes = [...nData, ...unsyncedNotes].sort((a, b) => 
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );

      setNotes(mergedNotes);
      await LocalDB.put('notes', mergedNotes);
    }

    // Ссылки
    if (lData) {
      setLinks(lData);
      await LocalDB.put('note_links', lData);
    }
  };

  // --- Bug Fix 4: Tag Cleanup ---
  // Если выбранный тег исчез (удалили заметку), сбрасываем фильтр
  useEffect(() => {
    if (selectedTag) {
      const tagExists = notes.some(n => n.content.includes(selectedTag));
      if (!tagExists) setSelectedTag(null);
    }
  }, [notes, selectedTag]);

  // --- Computed ---
  const backlinks = useMemo(() => {
    if (!selectedNoteId) return [];
    const sourceIds = links.filter(l => l.target_id === selectedNoteId).map(l => l.source_id);
    return notes.filter(n => sourceIds.includes(n.id));
  }, [selectedNoteId, links, notes]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    notes.forEach(note => {
      const regex = /#[\wа-яА-ЯёЁ]+/g;
      const found = note.content.match(regex);
      if (found) found.forEach(t => tags.add(t));
    });
    return Array.from(tags).sort();
  }, [notes]);

  // Фильтрация (теперь поиск не влияет на этот список, только теги)
  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      if (selectedTag) return n.content.includes(selectedTag);
      return true;
    });
  }, [notes, selectedTag]);

  // Группировка
  const notesByFolder = useMemo(() => {
    const grouped: Record<number | string, NoteType[]> = {};
    filteredNotes.forEach(n => {
      const key = n.folder_id || 'uncategorized';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(n);
    });
    return grouped;
  }, [filteredNotes]);

  // Результаты поиска (Spotlight)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return notes.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
  }, [searchQuery, notes]);

  // --- Graph Data (Fix 8: Squircles handled in render) ---
  const graphData = useMemo(() => {
    return {
      nodes: notes.map(n => ({ 
        id: n.id, 
        name: n.title, 
        group: n.folder_id || 0,
        isFav: n.is_favorite 
      })),
      links: links.map(l => ({ source: l.source_id, target: l.target_id }))
    };
  }, [notes, links]);

  // Обработка ручного соединения заметок на холсте
  const onConnect = useCallback(async (params: Connection) => {
    if (!params.source || !params.target) return;

    const sourceId = parseInt(params.source);
    const targetId = parseInt(params.target);

    const targetNote = notes.find(n => n.id === targetId);
    const sourceNote = notes.find(n => n.id === sourceId);

    if (!targetNote || !sourceNote) return;

    // 1. Визуально добавляем линию немедленно
    setRfEdges((eds) => addEdge({ ...params, type: 'smoothstep', style: { stroke: '#4f46e5' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#4f46e5' } }, eds));

    // 2. Добавляем текстовую ссылку [[...]] в контент исходной заметки (чтобы связь была настоящей)
    // Добавляем два переноса строки, если заметка не пустая
    const prefix = sourceNote.content ? '\n\n' : '';
    const newLinkText = `${prefix}[[${targetNote.title}]]`;
    const newContent = sourceNote.content + newLinkText;

    // 3. Обновляем локальное состояние заметок
    setNotes(prev => prev.map(n => n.id === sourceId ? { ...n, content: newContent } : n));

    // 4. Сохраняем обновление текста в Supabase
    await supabase.from('notes').update({ content: newContent }).eq('id', sourceId);

    // 5. Явно создаем связь в таблице связей (чтобы она сохранилась в базе)
    const { data } = await supabase.from('note_links').insert([{ source_id: sourceId, target_id: targetId }]).select();
    
    if (data) {
      setLinks(prev => [...prev, ...data]);
    }
  }, [notes, setRfEdges, setNotes]);

  // --- DAILY NOTES & INTEGRATION LOGIC ---

  // 1. Открыть (или создать) заметку за Сегодня (FIX: Авто-папка "Дневник")
  const handleOpenDaily = async (dateStr?: string) => {
    // FIX: Берем локальное время компьютера, а не UTC, чтобы после полуночи дата менялась сразу
    const d = new Date();
    const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    const targetDate = dateStr || localDate;
    const title = `📅 ${targetDate}`;

    // Ищем заметку
    const existingNote = notes.find(n => n.title === title);
    if (existingNote) {
      setSelectedNoteId(existingNote.id);
      setViewMode('edit');
      return;
    }

    // FIX: Ищем или создаем папку "Дневник"
    let journalFolder = folders.find(f => f.name === 'Дневник');
    if (!journalFolder) {
       const { data } = await supabase.from('folders').insert([{ name: 'Дневник' }]).select().single();
       if (data) {
         setFolders(prev => [...prev, data]);
         journalFolder = data;
       }
    }

    const dailyTemplate = `# ${title}\n\n### 🎯 Главное на сегодня\n\n### 📝 Заметки\n`;
    
    // Создаем заметку строго в папке Дневник
    const { data } = await supabase.from('notes').insert([{ 
      title: title, 
      content: dailyTemplate, 
      folder_id: journalFolder?.id || null 
    }]).select().single();

    if (data) {
      setNotes([data, ...notes]);
      setSelectedNoteId(data.id);
      setViewMode('edit');
      logEvent('brain', 'create', `Начат дневник: ${title}`, { id: data.id });
    }
  };

// 2. Интеграция: Импорт задач (FIX: Универсальный выбор колонок)
  const handleImportTasks = async () => {
    if (!activeNote) return;

    // Выбираем ВСЕ поля (*), чтобы не гадать с названиями колонок (is_completed vs completed)
    const { data: todos, error } = await supabase
      .from('todos')
      .select('*')
      .or(`is_my_day.eq.true,due_date.eq.${new Date().toISOString().split('T')[0]}`);

    if (error) {
      console.error('Ошибка:', error);
      alert(`Ошибка БД: ${error.message}. Проверь консоль.`);
      return;
    }

    if (!todos || todos.length === 0) {
      alert('Задач на сегодня не найдено.');
      return;
    }

    const taskList = todos.map((t: any) => {
      // Пытаемся угадать название поля завершения
      const isDone = t.is_completed ?? t.completed ?? t.is_complete ?? (t.status === 'completed');
      return `- [${isDone ? 'x' : ' '}] ${t.title}`;
    }).join('\n');

    const header = `\n\n### ✅ Задачи на сегодня (${new Date().toLocaleTimeString().slice(0,5)})\n`;
    
    const newContent = activeNote.content + header + taskList;
    setNotes(notes.map(n => n.id === activeNote.id ? { ...n, content: newContent } : n));
    await supabase.from('notes').update({ content: newContent }).eq('id', activeNote.id);
  };



  // --- Actions ---

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    // Получаем ID
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    // Генерируем локальный ID
    const tempId = LocalDB.generateLocalId();
    const localFolder = { 
        id: tempId, 
        name: newFolderName, 
        is_favorite: false,
        user_id: userId // <--- ВАЖНО: Привязываем к юзеру
    };

    // UI + Local
    setFolders([...folders, localFolder]);
    await LocalDB.put('folders', localFolder);
    setExpandedFolders(prev => ({ ...prev, [tempId]: true }));
    setNewFolderName('');
    setShowNewFolderInput(false);
    
    // Network
    const { data } = await supabase.from('folders').insert([{ name: newFolderName }]).select().single();
    if (data) {
      // Успех: меняем ID
      const realFolder = { ...localFolder, ...data }; 
      setFolders(prev => prev.map(f => f.id === tempId ? realFolder : f));
      await LocalDB.delete('folders', tempId);
      await LocalDB.put('folders', realFolder);
    } else {
      // Оффлайн: в очередь
      await LocalDB.addToSyncQueue({ table: 'folders', type: 'INSERT', payload: localFolder, tempId });
    }
  };

  const handleCreateNote = async (templateContent: string = '', title: string = 'Новая мысль', targetFolderId: number | null = null) => {
    const finalFolderId = targetFolderId; 
    
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    
    // 1. Временный ID и Объект
    const tempId = LocalDB.generateLocalId();
    const newNoteLocal = {
      id: tempId,
      user_id: userId,
      title,
      content: templateContent,
      folder_id: finalFolderId,
      updated_at: new Date().toISOString(),
      is_favorite: false,
      isUnsaved: true
    };
    
    // 2. Мгновенно показываем временную заметку
    // @ts-ignore
    setNotes(prev => [newNoteLocal, ...prev]);
    setSelectedNoteId(tempId);
    setViewMode('edit');
    setShowTemplates(false);

    // 3. Сохраняем в фоне
    try {
      await LocalDB.put('notes', newNoteLocal);
      
      const { data, error } = await supabase.from('notes').insert([{ 
        title: title, content: templateContent, folder_id: finalFolderId 
      }]).select().single();

      if (data && !error) {
        // ОНЛАЙН: Пришел настоящий ID
        const realNote = { ...newNoteLocal, ...data, isUnsaved: false };
        
        // --- ГЛАВНОЕ ИСПРАВЛЕНИЕ ---
        
        // 1. Обновляем список (меняем временный объект на настоящий)
        setNotes(prev => prev.map(n => n.id === tempId ? realNote : n));

        // 2. Обновляем выбор (используем функцию `current =>`, чтобы прочитать АКТУАЛЬНЫЙ ID)
        // Если мы всё еще смотрим на временную заметку — переключаемся на настоящую
        setSelectedNoteId(current => (current === tempId ? realNote.id : current));
        
        // 3. Чистим базу данных
        await LocalDB.delete('notes', tempId);
        await LocalDB.put('notes', realNote);
        
        logEvent('brain', 'create', `Новая мысль: ${title}`, { id: realNote.id });
      } else {
        // Оффлайн: просто добавляем в очередь синхронизации
        await LocalDB.addToSyncQueue({ table: 'notes', type: 'INSERT', payload: newNoteLocal, tempId });
      }
    } catch (e) {
      console.error("Ошибка при создании заметки:", e);
    }
  };

  const handleMoveNote = async (targetFolderId: number | null) => {
    if (!activeNote) return;
    // Обновляем локально
    setNotes(notes.map(n => n.id === activeNote.id ? { ...n, folder_id: targetFolderId } : n));
    // Обновляем в базе
    await supabase.from('notes').update({ folder_id: targetFolderId }).eq('id', activeNote.id);
  };

  // Linking System
  const processLinks = async (noteId: number, content: string) => {
    const regex = /\[\[(.*?)\]\]/g;
    const matches = [...content.matchAll(regex)];
    const titles = matches.map(m => m[1]);
    
    // Удаляем старые связи (Remote)
    await supabase.from('note_links').delete().eq('source_id', noteId);
    
    // Удаляем старые связи (Local) - ручной поиск, так как IndexedDB простой
    const allLinks = await LocalDB.getAll<LinkType>('note_links');
    const linksToDelete = allLinks.filter(l => l.source_id === noteId);
    for (const l of linksToDelete) {
        if (l.id) await LocalDB.delete('note_links', l.id);
    }
    
    if (titles.length === 0) {
        setLinks(prev => prev.filter(l => l.source_id !== noteId));
        return;
    }

    const targetNotes = notes.filter(n => titles.includes(n.title));
    if (targetNotes.length === 0) return;

    const newLinks = targetNotes.map(target => ({ source_id: noteId, target_id: target.id }));
    
    // Вставляем новые (Remote)
    const { data } = await supabase.from('note_links').insert(newLinks).select();
    
    if (data) {
       const others = links.filter(l => l.source_id !== noteId);
       const updatedLinks = [...others, ...data];
       setLinks(updatedLinks);
       await LocalDB.put('note_links', data); // Сохраняем новые связи локально
    }
  };

  const handleSaveNote = async () => {
    if (!activeNote) return;
    setIsSaving(true);

    const updated = { ...activeNote, updated_at: new Date().toISOString(), isUnsaved: false };
    
    // 1. Optimistic Update (UI + LocalDB)
    setNotes(notes.map(n => n.id === activeNote.id ? updated : n));
    await LocalDB.put('notes', updated);

    // 2. Remote Update
    await supabase.from('notes').update({ 
      title: activeNote.title, content: activeNote.content, updated_at: new Date().toISOString()
    }).eq('id', activeNote.id);
    
    await processLinks(activeNote.id, activeNote.content);
    setIsSaving(false);
  };

  const handleToggleFavoriteNote = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const n = notes.find(x => x.id === id);
    if (!n) return;
    const val = !n.is_favorite;
    setNotes(notes.map(x => x.id === id ? { ...x, is_favorite: val } : x));
    await supabase.from('notes').update({ is_favorite: val }).eq('id', id);
  };

  // Fix 9: Favorite Folders
  const handleToggleFavoriteFolder = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const f = folders.find(x => x.id === id);
    if (!f) return;
    const val = !f.is_favorite;
    setFolders(folders.map(x => x.id === id ? { ...x, is_favorite: val } : x));
    await supabase.from('folders').update({ is_favorite: val }).eq('id', id);
  };

  // Fix 10: Export Formats
  const handleExport = (format: 'md' | 'txt') => {
    if (!activeNote) return;
    const element = document.createElement("a");
    let text = activeNote.content;
    
    if (format === 'txt') {
        // Простая очистка для TXT (опционально можно усложнить)
        text = `ЗАГОЛОВОК: ${activeNote.title}\n\n${activeNote.content}`;
    }

    const file = new Blob([text], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${activeNote.title}.${format}`;
    document.body.appendChild(element);
    element.click();
    setShowExportMenu(false);
  };

  const handleDeleteNote = async (id: number) => {
    if (!confirm('Удалить заметку?')) return;
    
    // UI Instant
    setNotes(notes.filter(n => n.id !== id));
    setLinks(links.filter(l => l.source_id !== id && l.target_id !== id));
    if (selectedNoteId === id) setSelectedNoteId(null);
    
    // DBs
    await LocalDB.delete('notes', id); // <-- Local
    await supabase.from('notes').delete().eq('id', id); // <-- Remote
    
    const noteToDelete = notes.find(n => n.id === id);
    if (noteToDelete) logEvent('brain', 'delete', `Удалена заметка: ${noteToDelete.title}`);
  };
  
  const handleDeleteFolder = async (id: number) => {
    if (!confirm('Удалить папку?')) return;
    
    setFolders(folders.filter(f => f.id !== id));
    setNotes(notes.map(n => n.folder_id === id ? { ...n, folder_id: null } : n));
    
    await LocalDB.delete('folders', id); // <-- Local
    await supabase.from('folders').delete().eq('id', id); // <-- Remote
  };

  const handleInsertImage = () => {
    const url = prompt('Введите URL изображения:', 'https://');
    if (!url) return;

    // Спрашиваем ширину
    const width = prompt('Укажите ширину в пикселях (например, 300). Оставьте пустым для авто-размера:', '');

    let markdown = '';
    if (width && !isNaN(Number(width))) {
       // Генерируем синтаксис с "пайпом" | для размера
       markdown = `\n![Image|${width}](${url})\n`;
    } else {
       markdown = `\n![Image](${url})\n`;
    }

    if (activeNote) {
      const newContent = activeNote.content + markdown;
      setNotes(notes.map(n => n.id === activeNote.id ? { ...n, content: newContent } : n));
    }
  };


    // --- MARKDOWN RENDERERS ---
  const preprocessContent = (text: string) => {
    return text
      // 1. Финансовые виджеты [[FIN:Category]] -> ссылка-маркер
      .replace(/\[\[FIN:(.*?)\]\]/g, (match, category) => {
         // Создаем чистую ссылку, которую перехватит наш компонент
         return `[FIN:${category}](#fin-${encodeURIComponent(category)})`; 
      })
      // 2. Обычные ссылки [[Title]] -> #note-Title
      .replace(/\[\[(.*?)\]\]/g, (match, title) => {
        // Если это финансовый тег (пропустили регуляркой выше), не трогаем
        if (title.startsWith('FIN:')) return match; 
        return `[${title}](#note-${encodeURIComponent(title)})`; 
      });
  };

const MarkdownComponents = {
    // 1. Списки (Исправлено: теперь маркеры и цифры видны)
    ul: ({ children }: any) => <ul className="list-disc pl-5 my-4 space-y-1 text-neutral-300">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal pl-5 my-4 space-y-1 text-neutral-300">{children}</ol>,
    li: ({ children }: any) => <li className="pl-1 leading-relaxed">{children}</li>,

    // 2. Ссылки
    a: ({ href, children }: any) => {
      // 0. Финансовые виджеты
      if (href?.startsWith('#fin-')) {
         const category = decodeURIComponent(href.replace('#fin-', ''));
         return <FinanceChip category={category} />;
      }
      // Внутренние ссылки на заметки
      if (href?.startsWith('#note-')) {
        const targetTitle = decodeURIComponent(href.replace('#note-', ''));
        const targetNote = notes.find(n => n.title === targetTitle);
        const exists = !!targetNote;
        
        return (
          <a 
            href={href}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (targetNote) setSelectedNoteId(targetNote.id);
            }}
            className={`
              cursor-pointer font-medium px-1.5 py-0.5 rounded transition-colors duration-200 no-underline
              ${exists 
                ? 'text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/25' 
                : 'text-rose-400 bg-rose-500/10 opacity-60 cursor-not-allowed'
              }
            `}
            title={exists ? 'Перейти к заметке' : 'Заметка не найдена'}
          >
            {children}
          </a>
        );
      }
      // Обычные ссылки
      return (
        <a 
          href={href} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-sky-400 hover:text-sky-300 transition-colors border-b border-sky-400/30 hover:border-sky-400 no-underline"
        >
          {children}
        </a>
      );
    },

    // 3. Картинки (Ресайз)
    img: ({ src, alt }: any) => {
      let widthStr = undefined;
      let cleanAlt = alt;

      if (typeof alt === 'string' && alt.includes('|')) {
        const parts = alt.split('|');
        const lastPart = parts[parts.length - 1];
        if (!isNaN(Number(lastPart))) {
           widthStr = lastPart;
           cleanAlt = parts.slice(0, -1).join('|');
        }
      }

      return (
        <img 
          src={src} 
          alt={cleanAlt} 
          style={widthStr ? { width: `${widthStr}px` } : undefined}
          className="rounded-xl border border-white/10 max-w-full h-auto shadow-lg my-4 object-cover" 
        />
      );
    },

    // 4. Таблицы
    table: ({ children }: any) => <div className="overflow-x-auto my-4"><table className="min-w-full divide-y divide-white/10 border border-white/10 rounded-lg">{children}</table></div>,
    thead: ({ children }: any) => <thead className="bg-white/5">{children}</thead>,
    tbody: ({ children }: any) => <tbody className="divide-y divide-white/10">{children}</tbody>,
    tr: ({ children }: any) => <tr>{children}</tr>,
    th: ({ children }: any) => <th className="px-4 py-3 text-left text-xs font-medium text-neutral-300 uppercase tracking-wider">{children}</th>,
    td: ({ children }: any) => <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-300">{children}</td>,

    // 5. Callouts (Блоки внимания) - Исправленная логика
blockquote: ({ children }: any) => {
      const childrenArray = React.Children.toArray(children);
      
      // Ищем первый параграф <p>, игнорируя возможные пустые строки перед ним
      const firstPIndex = childrenArray.findIndex((child: any) => child?.type === 'p');
      const firstP = childrenArray[firstPIndex] as React.ReactElement;

      if (firstP) {
        const pChildren = React.Children.toArray((firstP as any).props.children);
        const firstText = pChildren[0];

        // Проверяем текст, даже если перед ним есть пробелы
        if (typeof firstText === 'string') {
          const match = firstText.match(/^\s*\[!(INFO|WARNING|SUCCESS|TIP)\]/i);

          if (match) {
            const type = match[1].toUpperCase();
            
            // Вырезаем маркер [!TIP] из текста
            const cleanText = firstText.replace(/^\s*\[!(INFO|WARNING|SUCCESS|TIP)\]\s*/i, '');
            
            // Создаем новый параграф без маркера
            const newPChildren = [...pChildren];
            newPChildren[0] = cleanText;
            const newFirstP = React.cloneElement(firstP, {}, newPChildren);
            
            // Собираем контент обратно
            const newChildren = [
                ...childrenArray.slice(0, firstPIndex),
                newFirstP,
                ...childrenArray.slice(firstPIndex + 1)
            ];

            let colors = 'bg-neutral-800 border-neutral-600';
            let Icon = Info;
            if (type === 'INFO') { colors = 'bg-blue-500/10 border-blue-500/50 text-blue-200'; Icon = Info; }
            if (type === 'WARNING') { colors = 'bg-amber-500/10 border-amber-500/50 text-amber-200'; Icon = AlertTriangle; }
            if (type === 'SUCCESS') { colors = 'bg-emerald-500/10 border-emerald-500/50 text-emerald-200'; Icon = CheckCircle; }
            if (type === 'TIP') { colors = 'bg-purple-500/10 border-purple-500/50 text-purple-200'; Icon = Lightbulb; }

            return (
              <div className={`my-4 p-4 rounded-xl border-l-4 ${colors} not-italic`}>
                <div className="flex items-center gap-2 font-bold mb-2 select-none opacity-100">
                  <Icon size={18} /> {type}
                </div>
                <div className="text-sm opacity-90">{newChildren}</div> 
              </div>
            );
          }
        }
      }
      // Обычная цитата
      return <blockquote className="border-l-4 border-neutral-600 pl-4 my-4 italic text-neutral-400">{children}</blockquote>;
    }
  };

  // Fix 8: Graph Node Canvas Object (Squircle)
  const drawNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const label = node.name;
    const fontSize = 12/globalScale;
    ctx.font = `${fontSize}px Sans-Serif`;
    const textWidth = ctx.measureText(label).width;
    const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.5); // padding

    // Colors
    const isFav = node.isFav;
    ctx.fillStyle = isFav ? 'rgba(245, 158, 11, 0.9)' : 'rgba(99, 102, 241, 0.9)'; // Amber or Indigo
    
    // Draw Squircle (Rounded Rect)
    const x = node.x - bckgDimensions[0] / 2;
    const y = node.y - bckgDimensions[1] / 2;
    const w = bckgDimensions[0];
    const h = bckgDimensions[1];
    const r = 4 / globalScale; // radius

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();

    // Text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(label, node.x, node.y);
  };

  // --- Android Back Button Logic ---
  useEffect(() => {
    const handleBackButton = async () => {
      // 1. Уровень: Модальные окна и меню (Самый высокий приоритет)
      if (showHelp) { setShowHelp(false); return; }
      if (showMobileMenu) { setShowMobileMenu(false); return; }
      if (showExportMenu) { setShowExportMenu(false); return; }
      if (showMoveMenu) { setShowMoveMenu(false); return; }
      if (showLinkTaskMenu) { setShowLinkTaskMenu(false); return; }
      if (showTemplates) { setShowTemplates(false); return; }

      // 2. Уровень: Спец. режимы (Граф или Холст)
      if (viewMode === 'graph' || viewMode === 'canvas') {
        setViewMode('edit');
        return;
      }

      // 3. Уровень: Открытая заметка
      if (selectedNoteId !== null) {
        // Если мы в режиме превью — сначала вернемся в редактор? 
        // Или сразу закроем заметку? Обычно лучше сразу закрыть.
        setSelectedNoteId(null);
        return;
      }

      // 4. Уровень: Корень виджета -> На главную
      router.push('/');
    };

    const listener = CapApp.addListener('backButton', handleBackButton);
    return () => {
      listener.then(l => l.remove());
    };
  }, [
    showHelp, showMobileMenu, showExportMenu, showMoveMenu, showLinkTaskMenu, showTemplates, // Модалки
    viewMode, selectedNoteId // Состояния навигации
  ]);

// --- AUTOSAVE LOGIC ---
  useEffect(() => {
    // Если автосохранение выключено или заметка не выбрана — выходим
    if (!autosaveEnabled || !activeNote || !activeNote.isUnsaved) return;

    // Сбрасываем предыдущий таймер
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    // Ставим новый таймер на 2 секунды бездействия
    autosaveTimerRef.current = setTimeout(() => {
       console.log('Autosaving...', activeNote.title);
       handleSaveNote();
    }, 2000);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [activeNote?.content, activeNote?.title, autosaveEnabled]); // Следим за контентом

  return (
    <div className="flex h-full w-full md:gap-6 relative">
      
      {/* Help Modal (ИНТЕРАКТИВНЫЙ) */}
      {showHelp && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
           <div className="bg-neutral-900 border border-white/10 p-6 rounded-2xl w-[90%] md:w-[600px] shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-white font-bold text-lg flex items-center gap-2"><Lightbulb className="text-amber-400" size={20}/> Справка и Сниппеты</h3>
                 <button onClick={() => setShowHelp(false)}><X size={20} className="text-neutral-500 hover:text-white"/></button>
              </div>
              
              <div className="space-y-8 text-sm text-neutral-300">
                 <p className="text-xs text-neutral-500 bg-neutral-800/50 p-2 rounded-lg border border-white/5 text-center mb-4">
                    💡 Нажми на любой пример кода, чтобы вставить его в заметку.
                 </p>
                 
                 {/* 1. ЭКОСИСТЕМА NEXUS */}
                 <div>
                    <h4 className="text-indigo-400 font-bold mb-3 uppercase text-xs tracking-wider border-b border-white/5 pb-1">⚡ Экосистема Nexus</h4>
                    <div className="grid grid-cols-1 gap-3">
                        <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                           <div className="font-bold text-white mb-1 flex items-center gap-2"><CheckSquare size={14} className="text-emerald-400"/> Задачи</div>
                           <p className="text-xs text-neutral-400 mb-2">Привязка задач через меню "Скрепка" 👇</p>
                        </div>
                        
                        <div className="bg-white/5 p-3 rounded-xl border border-white/5 hover:border-indigo-500/50 transition group cursor-pointer" onClick={() => handleInsertSnippet(' [[FIN:Еда]] ')}>
                           <div className="font-bold text-white mb-1 flex items-center gap-2"><Coins size={14} className="text-amber-400"/> Финансы</div>
                           <p className="text-xs text-neutral-400 mb-2">Нажми, чтобы вставить виджет категории:</p>
                           <code className="text-[10px] bg-black/30 px-2 py-1 rounded border border-white/10 group-hover:bg-indigo-500/20 group-hover:text-white transition">[[FIN:Еда]]</code>
                        </div>
                    </div>
                 </div>

                 {/* 2. ОФОРМЛЕНИЕ */}
                 <div>
                    <h4 className="text-sky-400 font-bold mb-3 uppercase text-xs tracking-wider border-b border-white/5 pb-1">📝 Оформление (Markdown)</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        {/* Заголовки */}
                        <div className="bg-neutral-800/50 p-2 rounded flex justify-between items-center cursor-pointer hover:bg-white/10 transition" onClick={() => handleInsertSnippet('\n# ')}>
                            <span>Заголовок 1</span> <code className="text-neutral-500 bg-black/20 px-1 rounded"># Текст</code>
                        </div>
                        <div className="bg-neutral-800/50 p-2 rounded flex justify-between items-center cursor-pointer hover:bg-white/10 transition" onClick={() => handleInsertSnippet('\n## ')}>
                            <span>Заголовок 2</span> <code className="text-neutral-500 bg-black/20 px-1 rounded">## Текст</code>
                        </div>
                        
                        {/* Стиль текста */}
                        <div className="bg-neutral-800/50 p-2 rounded flex justify-between items-center cursor-pointer hover:bg-white/10 transition" onClick={() => handleInsertSnippet('**текст**')}>
                            <span><b>Жирный</b></span> <code className="text-neutral-500 bg-black/20 px-1 rounded">**Текст**</code>
                        </div>
                        <div className="bg-neutral-800/50 p-2 rounded flex justify-between items-center cursor-pointer hover:bg-white/10 transition" onClick={() => handleInsertSnippet('*текст*')}>
                            <span><i>Курсив</i></span> <code className="text-neutral-500 bg-black/20 px-1 rounded">*Текст*</code>
                        </div>
                        
                        {/* Списки */}
                        <div className="bg-neutral-800/50 p-2 rounded flex justify-between items-center cursor-pointer hover:bg-white/10 transition" onClick={() => handleInsertSnippet('\n- ')}>
                            <span>Список</span> <code className="text-neutral-500 bg-black/20 px-1 rounded">- Пункт</code>
                        </div>
                        
                        {/* Чекбоксы */}
                        <div className="bg-neutral-800/50 p-2 rounded flex flex-col gap-1 cursor-pointer hover:bg-white/10 transition" onClick={() => handleInsertSnippet('\n- [ ] ')}>
                            <div className="flex justify-between items-center w-full">
                                <span>Задача</span> <code className="text-neutral-500 bg-black/20 px-1 rounded">- [ ] Дело</code>
                            </div>
                        </div>                    
                    </div>
                 </div>

                 {/* 3. ПРОДВИНУТЫЕ ФИШКИ */}
                 <div>
                    <h4 className="text-rose-400 font-bold mb-3 uppercase text-xs tracking-wider border-b border-white/5 pb-1">🚀 Блоки внимания</h4>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => handleInsertSnippet('\n> [!INFO] Важно\n> ')} className="bg-blue-500/10 border border-blue-500/20 p-2 rounded text-left hover:bg-blue-500/20 transition">
                            <div className="text-blue-400 font-bold text-xs mb-1">ℹ️ INFO</div>
                            <div className="text-[10px] text-blue-200 opacity-60">Для информации</div>
                        </button>
                        <button onClick={() => handleInsertSnippet('\n> [!WARNING] Внимание\n> ')} className="bg-amber-500/10 border border-amber-500/20 p-2 rounded text-left hover:bg-amber-500/20 transition">
                            <div className="text-amber-400 font-bold text-xs mb-1">⚠️ WARNING</div>
                            <div className="text-[10px] text-amber-200 opacity-60">Предупреждение</div>
                        </button>
                        <button onClick={() => handleInsertSnippet('\n> [!SUCCESS] Успех\n> ')} className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded text-left hover:bg-emerald-500/20 transition">
                            <div className="text-emerald-400 font-bold text-xs mb-1">✅ SUCCESS</div>
                            <div className="text-[10px] text-emerald-200 opacity-60">Успешное действие</div>
                        </button>
                        <button onClick={() => handleInsertSnippet('\n> [!TIP] Совет\n> ')} className="bg-purple-500/10 border border-purple-500/20 p-2 rounded text-left hover:bg-purple-500/20 transition">
                            <div className="text-purple-400 font-bold text-xs mb-1">💡 TIP</div>
                            <div className="text-[10px] text-purple-200 opacity-60">Полезный совет</div>
                        </button>
                    </div>

                    <h4 className="text-rose-400 font-bold mt-4 mb-3 uppercase text-xs tracking-wider border-b border-white/5 pb-1">🔗 Вставки</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                           <div className="cursor-pointer group" onClick={() => handleInsertSnippet(' [[Название]] ')}>
                              <div className="text-xs font-bold text-white mb-1">Связь заметок</div>
                              <code className="block bg-neutral-800/50 p-2 rounded text-xs text-neutral-400 group-hover:bg-white/10 transition">[[Название другой заметки]]</code>
                           </div>
                           <div className="cursor-pointer group" onClick={() => handleInsertSnippet(' ![Картинка|300](https://) ')}>
                              <div className="text-xs font-bold text-white mb-1">Картинка (300px)</div>
                              <code className="block bg-neutral-800/50 p-2 rounded text-xs text-neutral-400 group-hover:bg-white/10 transition">![Описание|300](ссылка)</code>
                           </div>
                    </div>
                 </div>

              </div>
           </div>
        </div>
      )}

      {/* --- SIDEBAR --- */}
      <div className={`w-full md:w-64 flex flex-col flex-shrink-0 bg-neutral-900/30 md:rounded-2xl border-r md:border border-white/5 overflow-hidden ${isMobileContentOpen ? 'hidden md:flex' : 'flex'}`}>
        {/* Toolbar */}
        <div className="p-4 border-b border-white/5 space-y-3 relative">
          
          {/* Fix 11: Spotlight Search */}
          <div className="relative">
             <Search size={14} className="absolute left-3 top-2.5 text-neutral-500" />
             <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Поиск..." className="w-full bg-neutral-900 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition"/>
             {/* Search Dropdown Results */}
             {searchQuery && (
               <div className="absolute top-full left-0 w-full mt-2 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                 {searchResults.length > 0 ? searchResults.map(r => (
                   <div key={r.id} onClick={() => { setSelectedNoteId(r.id); setViewMode('edit'); setSearchQuery(''); }} className="px-3 py-2 hover:bg-white/10 cursor-pointer flex items-center gap-2">
                      <FileText size={12} className="text-indigo-400"/>
                      <span className="text-xs text-white truncate">{r.title}</span>
                   </div>
                 )) : (
                   <div className="px-3 py-2 text-xs text-neutral-500">Ничего не найдено</div>
                 )}
               </div>
             )}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
               <button onClick={() => setShowTemplates(!showTemplates)} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-xs font-medium transition"><Plus size={14} /> Создать</button>
               {showTemplates && (
                 <div className="absolute top-full left-0 w-full mt-2 bg-neutral-800 border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden animate-in zoom-in-95">
                    {TEMPLATES.map(t => (
                      <button key={t.name} onClick={() => handleCreateNote(t.content, t.name)} className="w-full text-left px-3 py-2 text-xs text-neutral-300 hover:bg-white/5 hover:text-white transition flex items-center gap-2">
                        <FilePlus size={12}/> {t.name}
                      </button>
                    ))}
                 </div>
               )}
            </div>
            <button onClick={() => setShowNewFolderInput(!showNewFolderInput)} className="px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition"><Folder size={14} /></button>
          </div>
          {showNewFolderInput && (
            <div className="flex gap-1 animate-in slide-in-from-top-2">
              <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Папка..." className="flex-1 bg-neutral-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none" onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}/>
              <button onClick={handleCreateFolder} className="text-emerald-500 hover:bg-emerald-500/10 p-1 rounded"><Plus size={14}/></button>
            </div>
          )}
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
           
           <div className="space-y-1">
             <button onClick={() => { setSelectedNoteId(null); setViewMode('graph'); }} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition text-xs font-medium ${viewMode === 'graph' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}>
               <Share2 size={14} /> Карта знаний
             </button>

             <button 
                onClick={() => { setSelectedNoteId(null); setViewMode('canvas' as any); }} 
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition text-xs font-medium ${viewMode === 'canvas' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}
                >
                <LayoutGrid size={14} /> Холст (Canvas)
             </button>

             {/* DAILY NOTES SECTION */}
             <div className="pt-2 pb-1">
               <div className="px-2 text-[10px] uppercase text-neutral-500 font-bold tracking-wider mb-1 flex items-center gap-1">Дневник</div>
               <button 
                 onClick={() => handleOpenDaily()} 
                 className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition text-xs font-medium text-neutral-300 hover:bg-white/5 hover:text-white"
               >
                 <Clock size={14} className="text-emerald-400" /> Сегодня
               </button>
               <div 
                 className="relative group px-2 py-1 mt-1 cursor-pointer hover:bg-white/5 rounded-lg transition"
                 onClick={() => {
                   // Программно открываем календарь при клике на весь блок
                   try {
                     dateInputRef.current?.showPicker();
                   } catch (e) {
                     // Фолбек для старых браузеров: клик по самому инпуту
                     dateInputRef.current?.click();
                   }
                 }}
               >
                 <div className="flex items-center gap-2 text-xs text-neutral-400 group-hover:text-white transition">
                    <Calendar size={14} />
                    <span className="flex-1">Перейти к дате...</span>
                 </div>
                 
                 {/* Скрытый инпут, который мы активируем программно */}
                 <input 
                   ref={dateInputRef}
                   type="date" 
                   className="absolute opacity-0 w-0 h-0 top-0 left-0" // Полностью скрыт, не мешает верстке
                   onChange={(e) => {
                      if(e.target.value) handleOpenDaily(e.target.value);
                   }}
                 />
               </div>
             </div>
             
             {/* Favorites Section (Folders & Notes) */}
             {(folders.some(f => f.is_favorite) || notes.some(n => n.is_favorite)) && (
               <div className="pt-2">
                 <div className="px-2 text-[10px] uppercase text-neutral-500 font-bold tracking-wider mb-1 flex items-center gap-1"><Star size={10}/> Избранное</div>
                 {/* Fav Folders */}
                 {folders.filter(f => f.is_favorite).map(f => (
                   <div key={`fav-f-${f.id}`} onClick={() => { if(!expandedFolders[f.id]) setExpandedFolders(p => ({...p, [f.id]: true})); }} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition text-xs text-amber-500 hover:bg-white/5">
                      <Folder size={12} /> <span className="truncate">{f.name}</span>
                   </div>
                 ))}
                 {/* Fav Notes */}
                 {notes.filter(n => n.is_favorite).map(n => (
                   <div key={`fav-n-${n.id}`} onClick={() => { setSelectedNoteId(n.id); setViewMode('edit'); }} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition text-xs text-amber-500 hover:bg-white/5">
                      <FileText size={12} /> <span className="truncate">{n.title}</span>
                   </div>
                 ))}
               </div>
             )}
           </div>

           {/* Folders & Notes Tree */}
           <div>
              <div className="px-2 text-[10px] uppercase text-neutral-500 font-bold tracking-wider mb-1">Файлы</div>
              {folders.map(folder => (
                <div key={folder.id} className="space-y-0.5">
                  <div className="group flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white cursor-pointer transition">
                    <div className="flex items-center gap-2 flex-1 overflow-hidden" onClick={() => { setExpandedFolders(prev => ({ ...prev, [folder.id]: !prev[folder.id] })) }}>
                      {expandedFolders[folder.id] ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                      <Folder size={14} className={folder.is_favorite ? "text-amber-500" : "text-indigo-400"} />
                      <span className="text-xs font-medium truncate">{folder.name}</span>
                    </div>
                    <div className={`flex items-center gap-1 transition ${isTouch ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      {/* Fix 1: Pass folder ID */}
                      <button onClick={() => handleCreateNote('', 'Новая заметка', folder.id)} title="Создать в папке"><Plus size={12} className="hover:text-indigo-400"/></button>
                      <button onClick={(e) => handleToggleFavoriteFolder(e, folder.id)}><Star size={12} className={folder.is_favorite ? "text-amber-500" : "hover:text-amber-500"} fill={folder.is_favorite ? "currentColor" : "none"}/></button>
                      <button onClick={() => handleDeleteFolder(folder.id)}><Trash2 size={12} className="hover:text-rose-400"/></button>
                    </div>
                  </div>
                  {expandedFolders[folder.id] && notesByFolder[folder.id]?.map(note => (
                    <div key={note.id} onClick={() => { setSelectedNoteId(note.id); setViewMode('edit'); }} className={`ml-6 group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition text-xs ${selectedNoteId === note.id ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>
                      <div className="flex items-center gap-2 overflow-hidden">
                         <FileText size={12} />
                         <span className="truncate">{note.title || 'Без названия'}</span>
                      </div>
                      <button onClick={(e) => handleToggleFavoriteNote(e, note.id)} className={`transition ${isTouch ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${note.is_favorite ? 'text-amber-500 opacity-100' : 'text-neutral-600 hover:text-amber-500'}`}><Star size={10} fill={note.is_favorite ? "currentColor" : "none"}/></button>
                    </div>
                  ))}
                </div>
              ))}
              {notesByFolder['uncategorized']?.map(note => (
                <div key={note.id} onClick={() => { setSelectedNoteId(note.id); setViewMode('edit'); }} className={`group flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition text-xs ${selectedNoteId === note.id ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-neutral-300'}`}>
                   <div className="flex items-center gap-2 overflow-hidden"><FileText size={12} /><span className="truncate">{note.title || 'Без названия'}</span></div>
                   <button onClick={(e) => handleToggleFavoriteNote(e, note.id)} className={`transition ${note.is_favorite ? 'text-amber-500 opacity-100' : 'text-neutral-600 hover:text-amber-500'} ${isTouch ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <Star size={10} fill={note.is_favorite ? "currentColor" : "none"}/>
                   </button>
                </div>
              ))}
           </div>

           {/* Tags */}
           {allTags.length > 0 && (
             <div>
               <div className="px-2 text-[10px] uppercase text-neutral-500 font-bold tracking-wider mb-1">Теги</div>
               <div className="flex flex-wrap gap-1 px-2">
                 {allTags.map(tag => (
                   <button key={tag} onClick={() => setSelectedTag(selectedTag === tag ? null : tag)} className={`px-2 py-1 rounded text-[10px] border transition ${selectedTag === tag ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-transparent text-neutral-400 border-white/10 hover:border-white/30'}`}>
                     {tag}
                   </button>
                 ))}
               </div>
             </div>
           )}
        </div>
      </div>

      {/* --- MAIN AREA --- */}
      <div className="flex-1 flex flex-col bg-neutral-900/50 rounded-2xl border border-white/5 overflow-hidden backdrop-blur-sm relative">
        
        {viewMode === 'graph' && (
           <div className="flex-1 bg-neutral-950 relative">
            {/* КНОПКА ВЫХОДА */}
              <button 
                onClick={() => setViewMode('edit')} 
                className="absolute top-4 right-4 z-50 p-2 bg-neutral-800/80 backdrop-blur text-white rounded-full border border-white/10 shadow-xl hover:bg-rose-500/20 hover:text-rose-400 transition"
              >
                <X size={24} />
              </button>
              <div className="absolute top-4 left-4 z-10 bg-neutral-900/80 p-2 rounded-lg text-xs text-neutral-400 border border-white/10 pointer-events-none">Интерактивная карта знаний</div>
              <ForceGraph2D 
                graphData={graphData} 
                nodeLabel="name" 
                linkColor={() => '#333'} 
                backgroundColor="#0a0a0a" 
                nodeCanvasObject={drawNode} // Fix 8: Squircle nodes
                onNodeClick={(node: any) => { setSelectedNoteId(node.id); setViewMode('edit'); }} 
              />
           </div>
        )}

        {/* CANVAS VIEW */}
        {/* @ts-ignore */}
        {viewMode === 'canvas' && (
           <div className="flex-1 bg-neutral-950 relative h-full text-black">
            {/* КНОПКА ВЫХОДА */}
              <button 
                onClick={() => setViewMode('edit')} 
                className="absolute top-4 right-4 z-50 p-2 bg-neutral-800/80 backdrop-blur text-white rounded-full border border-white/10 shadow-xl hover:bg-rose-500/20 hover:text-rose-400 transition"
              >
                <X size={24} />
              </button>
              <div className="absolute top-4 left-4 z-10 bg-neutral-900/80 p-2 rounded-lg text-xs text-neutral-400 border border-white/10 pointer-events-none">
                 Бесконечный холст (Drag & Zoom)
              </div>
              <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeDragStop={onNodeDragStop}
                onNodeDoubleClick={onNodeDoubleClick}
                fitView
                minZoom={0.1}
                maxZoom={4}
                proOptions={{ hideAttribution: true }}
                colorMode="dark"
              >
                <Background color="#333" gap={20} />
                <Controls />
                <MiniMap style={{ background: '#171717' }} nodeStrokeColor="#555" nodeColor="#333" />
              </ReactFlow>
           </div>
        )}

        {viewMode !== 'graph' && activeNote ? (
          <>
          <div className="h-14 border-b border-white/5 flex items-center gap-2 pl-2 pr-14 md:px-6 bg-neutral-900/50 shrink-0">
              {/* 1. Кнопка НАЗАД (только на мобильном) */}
              <button onClick={() => setSelectedNoteId(null)} className="md:hidden p-2 text-neutral-400 hover:text-white shrink-0">
                  <ArrowLeft size={20} />
              </button>

              <input 
                value={activeNote.title} 
                onChange={e => setNotes(notes.map(n => n.id === activeNote.id ? { ...n, title: e.target.value, isUnsaved: true } : n))} 
                className="bg-transparent text-lg font-medium text-white focus:outline-none w-full min-w-0 truncate" 
                placeholder="Название заметки"
              />

              <div className="flex items-center gap-1 md:gap-2 shrink-0">
                  
                  {/* --- DESKTOP TOOLBAR (Скрыто на мобильном, видно на ПК) --- */}
                  <div className="hidden md:flex items-center gap-1 md:gap-2">
                      <button onClick={handleImportTasks} className="p-2 text-neutral-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition" title="Импорт задач"><CheckSquare size={18} /></button>
                      
                      {/* Выбор папки (Desktop) */}
                      <div className="relative mr-2">
                      <button 
                          onClick={() => setShowMoveMenu(!showMoveMenu)}
                          className={`flex items-center gap-2 text-xs px-2 py-1 rounded transition ${showMoveMenu ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/5'}`}
                      >
                          <Folder size={14}/>
                          <span className="max-w-[100px] truncate">{folders.find(f => f.id === activeNote.folder_id)?.name || 'Без папки'}</span>
                          <ChevronDown size={10}/>
                      </button>
                      {showMoveMenu && (
                          <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowMoveMenu(false)}/>
                          <div className="absolute top-full right-0 mt-1 w-48 bg-neutral-800 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden custom-scrollbar max-h-60 overflow-y-auto">
                              <button onClick={() => { handleMoveNote(null); setShowMoveMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-neutral-300 hover:bg-white/5 hover:text-white border-b border-white/5">Без папки</button>
                              {folders.map(f => (
                              <button key={f.id} onClick={() => { handleMoveNote(f.id); setShowMoveMenu(false); }} className="w-full text-left px-3 py-2 text-xs text-neutral-300 hover:bg-white/5 hover:text-white truncate">{f.name}</button>
                              ))}
                          </div>
                          </>
                      )}
                      </div>

                      <div className="w-px h-4 bg-white/10 mx-1" />
                      <button onClick={() => setShowHelp(true)} className="p-2 text-neutral-500 hover:text-white hover:bg-white/5 rounded-lg transition" title="Справка"><HelpCircle size={18} /></button>
                      <button onClick={handleInsertImage} className="p-2 text-neutral-500 hover:text-white hover:bg-white/5 rounded-lg transition" title="Фото"><ImageIcon size={18} /></button>
                      <div className="w-px h-4 bg-white/10 mx-1" />
                      
                      {/* Экспорт (Desktop) */}
                      <div className="relative">
                      <button onClick={() => setShowExportMenu(!showExportMenu)} className="p-2 text-neutral-400 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg transition" title="Скачать"><Download size={18} /></button>
                      {showExportMenu && (
                          <div className="absolute top-full right-0 mt-2 w-32 bg-neutral-800 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                              <button onClick={() => handleExport('md')} className="w-full text-left px-4 py-2 text-xs hover:bg-white/5 flex items-center gap-2 text-white"><FileText size={12}/> Markdown</button>
                              <button onClick={() => handleExport('txt')} className="w-full text-left px-4 py-2 text-xs hover:bg-white/5 flex items-center gap-2 text-white"><File size={12}/> TXT</button>
                          </div>
                      )}
                      </div>
                      <button onClick={() => handleDeleteNote(activeNote.id)} className="p-2 text-neutral-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition" title="Удалить"><Trash2 size={18} /></button>
                  </div>

                  {/* --- ОБЩИЕ КНОПКИ (Видны всегда) --- */}
                  <button 
                    onClick={handleSaveNote} 
                    className={`p-2 rounded-lg transition flex items-center gap-2 ${
                      activeNote.isUnsaved ? 'text-amber-400 bg-amber-500/10 animate-pulse' : 
                      'text-emerald-400 bg-emerald-500/10'
                    }`} 
                    title={activeNote.isUnsaved ? 'Есть несохраненные изменения' : 'Все сохранено'}
                  >
                    {isSaving ? <Loader2 size={18} className="animate-spin"/> : <Save size={18} />}
                    <span className="hidden md:inline text-xs font-bold">
                      {isSaving ? '...' : activeNote.isUnsaved ? 'Сохранить' : 'Готово'}
                    </span>
                  </button>

                  <button onClick={() => setViewMode(viewMode === 'edit' ? 'preview' : 'edit')} className={`p-2 rounded-lg transition ${viewMode !== 'edit' ? 'text-indigo-400 bg-indigo-500/10' : 'text-neutral-500 hover:text-white'}`}>
                  {viewMode === 'edit' ? <Eye size={18} /> : <Edit3 size={18} />}
                  </button>

                  {/* --- МОБИЛЬНОЕ МЕНЮ ("Три точки") --- */}
                  <div className="relative md:hidden">
                      <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="p-2 text-neutral-400 hover:text-white rounded-lg transition">
                      <MoreVertical size={18} />
                      </button>

                        {showMobileMenu && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowMobileMenu(false)}/>
                                        <div className="absolute top-full right-0 mt-2 w-64 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden py-1 animate-in zoom-in-95 origin-top-right">
                                            
                                            {mobileMenuMode === 'main' ? (
                                              /* ГЛАВНОЕ МЕНЮ */
                                              <>
                                                <div className="px-3 py-2 text-[10px] uppercase text-neutral-500 font-bold border-b border-white/5">Меню</div>
                                                
                                                {/* Кнопка перехода к папкам */}
                                                <button onClick={() => setMobileMenuMode('folders')} className="w-full text-left px-4 py-3 text-xs text-white hover:bg-white/5 flex items-center gap-3">
                                                    <Folder size={14} className="text-neutral-400"/> 
                                                    <span className="truncate flex-1">{folders.find(f => f.id === activeNote.folder_id)?.name || 'Без папки'}</span>
                                                    <ChevronRight size={12} className="text-neutral-600"/>
                                                </button>

                                                <div className="h-px bg-white/5 my-1" />

                                                <button onClick={() => { setShowMobileMenu(false); handleImportTasks(); }} className="w-full text-left px-4 py-3 text-xs text-white hover:bg-white/5 flex items-center gap-3">
                                                    <CheckSquare size={14} className="text-neutral-400"/> Импорт задач
                                                </button>

                                                <button onClick={() => { setShowMobileMenu(false); handleInsertImage(); }} className="w-full text-left px-4 py-3 text-xs text-white hover:bg-white/5 flex items-center gap-3">
                                                    <ImageIcon size={14} className="text-neutral-400"/> Вставить фото
                                                </button>

                                                <button onClick={() => { setShowMobileMenu(false); setShowHelp(true); }} className="w-full text-left px-4 py-3 text-xs text-white hover:bg-white/5 flex items-center gap-3">
                                                    <HelpCircle size={14} className="text-neutral-400"/> Справка MD
                                                </button>

                                                <div className="h-px bg-white/5 my-1" />
                                                
                                                <button onClick={() => { handleDeleteNote(activeNote.id); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-xs text-rose-400 hover:bg-rose-500/10 flex items-center gap-3">
                                                    <Trash2 size={14}/> Удалить заметку
                                                </button>
                                              </>
                                            ) : (
                                              /* МЕНЮ ВЫБОРА ПАПКИ */
                                              <>
                                                <div className="flex items-center gap-2 px-2 py-2 border-b border-white/5">
                                                  <button onClick={() => setMobileMenuMode('main')} className="p-1 hover:bg-white/10 rounded text-neutral-400 hover:text-white"><ArrowLeft size={14}/></button>
                                                  <span className="text-[10px] uppercase text-neutral-500 font-bold">Выберите папку</span>
                                                </div>
                                                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                                  <button onClick={() => { handleMoveNote(null); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-xs text-neutral-300 hover:bg-white/5 hover:text-white border-b border-white/5 flex items-center gap-2">
                                                    <Folder size={12} className="opacity-50"/> Без папки
                                                  </button>
                                                  {folders.map(f => (
                                                    <button key={f.id} onClick={() => { handleMoveNote(f.id); setShowMobileMenu(false); }} className={`w-full text-left px-4 py-3 text-xs hover:bg-white/5 flex items-center gap-2 ${activeNote.folder_id === f.id ? 'text-indigo-400 bg-indigo-500/10' : 'text-neutral-300'}`}>
                                                      <Folder size={12} /> {f.name}
                                                    </button>
                                                  ))}
                                                </div>
                                              </>
                                            )}
                                        </div>
                                    </>
                                  )}
                  </div>

              </div>
          </div>

            <div className="flex-1 overflow-hidden relative flex flex-col">
              {viewMode === 'edit' ? (
              <textarea 
                ref={textareaRef}
                value={activeNote.content} 
                onChange={e => setNotes(notes.map(n => n.id === activeNote.id ? { ...n, content: e.target.value, isUnsaved: true } : n))} 
                placeholder="Пишите здесь... Используйте #теги и [[ссылки]]." 
                style={{ fontSize: 'var(--note-font-size)' }}
                className="flex-1 bg-transparent p-4 md:p-8 text-neutral-300 resize-none focus:outline-none font-mono leading-relaxed custom-scrollbar" 
              />
              ) : (
                <div style={{ fontSize: 'var(--note-font-size)' }} className="flex-1 p-8 overflow-y-auto custom-scrollbar prose prose-invert max-w-none prose-headings:font-light prose-p:text-neutral-300 prose-ul:list-disc prose-ol:list-decimal">
                  {/* Fix 2, 5, 6: Enhanced Markdown Renderer */}
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    components={MarkdownComponents}
                  >
                    {preprocessContent(activeNote.content)}
                  </ReactMarkdown>
                </div>
              )}
              {/* LINKED TASKS PANEL (ОБНОВЛЕННАЯ) */}
              <div className="border-t border-white/5 bg-neutral-900/30 p-4">
                 <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-neutral-500 uppercase">
                      <CheckSquare size={12}/> Связанные задачи
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {/* 1. Поле быстрого создания */}
                        <input 
                          type="text"
                          placeholder="Новое дело..."
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleCreateAndLinkTask(e.currentTarget.value);
                              e.currentTarget.value = ''; // Очистить поле
                            }
                          }}
                          className="bg-black/20 border border-white/5 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:border-indigo-500 w-24 md:w-32 transition-all placeholder:text-neutral-600"
                        />
                        
                        {/* 2. Кнопка привязки существующих */}
                        <div className="relative">
                          <button onClick={loadAllTasks} className="p-1.5 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white rounded-lg transition" title="Привязать существующую">
                            <Link2 size={14}/>
                          </button>
                          
                          {/* Выпадающее меню выбора задач */}
                          {showLinkTaskMenu && (
                            <>
                             <div className="fixed inset-0 z-40" onClick={() => setShowLinkTaskMenu(false)}/>
                             <div className="absolute bottom-full right-0 mb-2 w-64 bg-neutral-800 border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden animate-in zoom-in-95">
                               <div className="px-3 py-2 text-[10px] uppercase text-neutral-500 font-bold border-b border-white/5">Выберите задачу</div>
                               <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                 {allTasks.length > 0 ? allTasks.map(t => (
                                   <button key={t.id} onClick={() => handleLinkTask(t.id)} className="w-full text-left px-3 py-2 text-xs text-neutral-300 hover:bg-white/5 hover:text-white truncate">
                                     {t.title}
                                   </button>
                                 )) : <div className="p-3 text-xs text-neutral-500 text-center">Нет свободных задач</div>}
                               </div>
                             </div>
                            </>
                          )}
                        </div>
                    </div>
                 </div>

                 {/* Список задач */}
                 {linkedTasks.length > 0 ? (
                   <div className="space-y-1">
                     {linkedTasks.map(task => (
                       <div key={task.id} className="group flex items-center justify-between px-3 py-2 bg-neutral-800/50 border border-white/5 rounded-lg hover:border-indigo-500/30 transition">
                          
                          {/* Кликабельная область для перехода к задаче */}
                          <div 
                            className="flex items-center gap-2 overflow-hidden cursor-pointer flex-1"
                            onClick={() => router.push(`/tasks?id=${task.id}`)}
                            title="Перейти к задаче"
                          >
                             <div className={`w-3 h-3 rounded border shrink-0 ${task.is_completed || task.is_complete ? 'bg-emerald-500 border-emerald-500' : 'border-neutral-500'}`} />
                             <span className={`text-xs truncate ${task.is_completed || task.is_complete ? 'text-neutral-500 line-through' : 'text-neutral-300'}`}>
                                {task.title}
                             </span>
                          </div>

                          {/* Кнопка отвязки (Видна всегда на телефоне, на ПК при наведении) */}
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleUnlinkTask(task.id); }} 
                            className={`p-1.5 rounded text-neutral-600 hover:text-rose-500 transition ${isTouch ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} 
                            title="Отвязать"
                          >
                             <Unlink size={14}/>
                          </button>
                       </div>
                     ))}
                   </div>
                 ) : (
                   <div className="text-xs text-neutral-600 italic pl-1">Нет привязанных задач</div>
                 )}
              </div>
              {backlinks.length > 0 && (
                <div className="h-24 border-t border-white/5 bg-neutral-900/30 p-4 overflow-y-auto custom-scrollbar">
                   <div className="flex items-center gap-2 text-xs font-bold text-neutral-500 uppercase mb-2"><LinkIcon size={12}/> Ссылки на эту заметку</div>
                   <div className="flex flex-wrap gap-2">{backlinks.map(bn => (<button key={bn.id} onClick={() => setSelectedNoteId(bn.id)} className="px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 hover:text-indigo-200 text-xs rounded-full border border-indigo-500/20 transition">{bn.title}</button>))}</div>
                </div>
              )}
            </div>
          </>
        ) : viewMode !== 'graph' && (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-600">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4"><FileText size={32} className="opacity-50" /></div>
            <p className="text-sm">Выберите заметку или откройте Карту знаний</p>
          </div>
        )}
      </div>
    </div>
  );
}