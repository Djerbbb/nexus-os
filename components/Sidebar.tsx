"use client";

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { 
  LayoutDashboard, CheckSquare, Wallet, Brain, Activity,
  LogOut, Hexagon, UserCircle, Edit2, X, Check, Loader2,
  AlertTriangle, Lock, Wifi, WifiOff, RefreshCw,
  Bell, BellOff, Shield, Clock, ShieldAlert, Dumbbell
} from 'lucide-react';
import { LocalDB } from '@/lib/db';
import { CloudOff } from 'lucide-react';
import { useDevice } from '@/lib/device';
import { NotificationManager } from '@/lib/notifications';

const MENU_ITEMS = [
  { name: 'Обзор', path: '/', icon: <LayoutDashboard size={20} /> },
  { name: 'Задачи', path: '/tasks', icon: <CheckSquare size={20} /> },
  { name: 'Финансы', path: '/finance', icon: <Wallet size={20} /> },
  { name: 'База знаний', path: '/brain', icon: <Brain size={20} /> },
  { name: 'Kinetic', path: '/kinetic', icon: <Dumbbell size={20} /> },
  { name: 'Chronos', path: '/chronos', icon: <Activity size={20} /> },
];

export default function Sidebar() {
  const { isTouch } = useDevice();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('user'); // Состояние роли
  
  // Состояния редактирования профиля
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  
  // Состояния сети
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0); // Счетчик очереди

  // Состояние уведомлений
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // --- ЛОГИКА СВАЙПА (ИСПРАВЛЕННАЯ: GLOBAL WINDOW LISTENER) ---
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const isMobileOpenRef = useRef(false);       // Актуальное состояние для слушателей событий
  const sidebarRef = useRef<HTMLElement>(null);    // Ссылка на само меню
  const backdropRef = useRef<HTMLDivElement>(null); // Ссылка на затемнение

  // Синхронизируем Ref с состоянием (чтобы жесты знали правду)
  useEffect(() => {
    isMobileOpenRef.current = isMobileOpen;
  }, [isMobileOpen]);
  // --------------------
  
  const touchStartX = useRef<number | null>(null);
  const isDragging = useRef(false);
  const SIDEBAR_WIDTH = 280;

  // Синхронизируем Ref с состоянием React (чтобы жесты знали, открыто меню или нет)
  useEffect(() => {
    isMobileOpenRef.current = isMobileOpen;
  }, [isMobileOpen]);

  // ГЛАВНАЯ МАГИЯ ЖЕСТОВ
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // 1. Проверяем, куда тыкнули
      const target = e.target as HTMLElement;
      const x = e.touches[0].clientX;
      const screenWidth = window.innerWidth;

      // Если тыкнули в Канвас или Граф -> зона свайпа узкая (40px)
      // Иначе -> зона широкая (30% экрана)
      const isInteractiveArea = target.closest('canvas, .react-flow, .vis-network');
      const triggerZone = isInteractiveArea ? 40 : (screenWidth / 3);

      // Если меню закрыто, разрешаем свайп ТОЛЬКО из зоны триггера
      if (!isMobileOpenRef.current && x > triggerZone) return;

      isDragging.current = true;
      touchStartX.current = x;

      // Отключаем плавную анимацию на время пальца (для мгновенного отклика)
      if (sidebarRef.current) {
         sidebarRef.current.style.transition = 'none';
         void sidebarRef.current.offsetWidth;
         const startPos = isMobileOpenRef.current ? 0 : -SIDEBAR_WIDTH;
         sidebarRef.current.style.transform = `translateX(${startPos}px)`;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || touchStartX.current === null) return;
      
      const x = e.touches[0].clientX;
      const delta = x - touchStartX.current;
      
      // Если тянем меню, блокируем скролл страницы, чтобы она не дёргалась
      if (Math.abs(delta) > 5 && e.cancelable) {
         e.preventDefault(); 
      }

      // Считаем позицию
      let currentX = (isMobileOpenRef.current ? 0 : -SIDEBAR_WIDTH) + delta;
      
      // Ограничители
      if (currentX > 0) currentX = 0;
      if (currentX < -SIDEBAR_WIDTH) currentX = -SIDEBAR_WIDTH;


      // Двигаем элементы напрямую
      if (sidebarRef.current) sidebarRef.current.style.transform = `translateX(${currentX}px)`;
    };

    const handleTouchEnd = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      touchStartX.current = null;

      // Возвращаем плавную анимацию
      if (sidebarRef.current) sidebarRef.current.style.transition = 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)';

      // Смотрим, где бросили меню
      let currentTranslate = -SIDEBAR_WIDTH;
      if (sidebarRef.current) {
          const style = window.getComputedStyle(sidebarRef.current);
          const matrix = new WebKitCSSMatrix(style.transform);
          currentTranslate = matrix.m41;
      }

      const threshold = SIDEBAR_WIDTH / 3;
      let shouldOpen = false;

      if (isMobileOpenRef.current) {
          shouldOpen = currentTranslate > -threshold; // Если открыто и не утащили далеко влево -> оставить открытым
      } else {
          shouldOpen = currentTranslate > -(SIDEBAR_WIDTH - threshold); // Если закрыто и вытащили далеко вправо -> открыть
      }

      setIsMobileOpen(shouldOpen);

      // Сбрасываем инлайн-стили, отдаем контроль React/CSS
      if (sidebarRef.current) sidebarRef.current.style.transform = '';
    };

    // Вешаем слушатели на все окно
    // passive: false нужно для того, чтобы работал e.preventDefault() в touchmove
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []); 

  // --- ЭФФЕКТЫ ---

  // Закрываем при переходе по ссылке
  useEffect(() => { setIsMobileOpen(false); }, [pathname]);

  // Auth & Profile
useEffect(() => {
  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user || null);
    if (session?.user) {
       setNewName(session.user.user_metadata?.full_name || '');
       if (session.user.user_metadata?.avatar_url) {
          setAvatarUrl(`${session.user.user_metadata.avatar_url}?t=${new Date().getTime()}`);
       }

       // НОВОЕ: Запрашиваем роль из таблицы profiles
       const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();
       if (profile) setUserRole(profile.role);
    }
    if (!session && pathname !== '/auth' && pathname !== '/update-password') router.push('/auth');
  };
  checkUser();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      if (session?.user) {
         setNewName(session.user.user_metadata?.full_name || '');
         // Добавлено: обновление аватарки при изменении профиля
         if (session.user.user_metadata?.avatar_url) {
            setAvatarUrl(`${session.user.user_metadata.avatar_url}?t=${new Date().getTime()}`);
         }
      }
      if (!session && pathname !== '/auth' && pathname !== '/update-password') router.push('/auth');
    });
    return () => subscription.unsubscribe();
  }, [pathname, router]);

  // Notifications & Network
  useEffect(() => {
    const checkStatus = async () => {
       // 0. ПРОВЕРКА ПРАВ (ИСПРАВЛЕНИЕ)
       // Сразу проверяем реальный статус прав, чтобы кнопка горела зеленым
       const isGranted = await NotificationManager.hasPermission();
       setNotificationsEnabled(isGranted);

       // 1. Проверяем уведомления
       NotificationManager.checkUpcomingTasks();
       
       // 2. Проверяем очередь синхронизации
       try {
         // @ts-ignore
         const queue = await LocalDB.getAll('sync_queue');
         // @ts-ignore
         setPendingCount(queue ? queue.length : 0);
       } catch (e) {
         console.error("Queue check error", e);
       }
    };
    
    // Запускаем проверку сразу
    checkStatus();

    // И ставим таймеры
    const interval = setInterval(() => NotificationManager.checkUpcomingTasks(), 60000);
    const timeout = setTimeout(() => NotificationManager.checkUpcomingTasks(), 5000);
    
    const handleOnline = () => { setIsOnline(true); setIsSyncing(true); setTimeout(() => setIsSyncing(false), 2000); };
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
        setIsOnline(navigator.onLine);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
    }

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  const toggleNotifications = async () => {
    if (!notificationsEnabled) {
      const granted = await NotificationManager.requestPermission();
      setNotificationsEnabled(granted);
      if (granted) NotificationManager.send('Nexus', 'Уведомления активированы ✅');
    }
  };

  const handleLogout = async () => { 
    try {
      // Полностью очищаем локальную базу данных перед выходом
      // Чтобы следующий пользователь не увидел твои данные
      await LocalDB.clear(); 
    } catch (e) {
      console.error("Ошибка при очистке данных:", e);
    }
    
    await supabase.auth.signOut(); 
    router.push('/auth'); 
  };

  const handleUpdateName = async () => {
    if (!newName.trim()) return;
    setEditLoading(true); setEditError(null);
    try {
      const { error: dbError } = await supabase.from('profiles').update({ username: newName }).eq('id', user.id);
      if (dbError) throw dbError;
      const { data: { user: updatedUser }, error: authError } = await supabase.auth.updateUser({ data: { full_name: newName } });
      if (authError) throw authError;
      setUser(updatedUser); setIsEditing(false);
    } catch (err: any) {
      if (err.message?.includes('unique constraint')) setEditError('Это имя уже занято');
      else setEditError('Ошибка обновления');
    } finally {
      setEditLoading(false);
    }
  };

  if (pathname === '/auth' || pathname === '/update-password') return null;

  return (
    <>

      {/* 2. ЗАТЕМНЕНИЕ (BACKDROP) */}
      <div 
        ref={backdropRef} // Теперь переменная объявлена, ошибки не будет
        onClick={() => setIsMobileOpen(false)}
        className={`fixed inset-0 bg-black/80 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300 ${
           isMobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* 3. SIDEBAR */}
      <aside 
        ref={sidebarRef} // Теперь переменная объявлена, ошибки не будет
        // Мы убрали отсюда onTouchStart, так как теперь слушаем window
        className={`
          fixed md:relative inset-y-0 left-0 z-50
          w-[280px] md:w-64 h-screen bg-neutral-950 border-r border-white/5 flex flex-col flex-shrink-0
          shadow-2xl md:shadow-none
          will-change-transform
          /* Классы управляют состоянием покоя */
          md:translate-x-0
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
          
          pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]
        `}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Hexagon size={18} className="text-white fill-white" />
            </div>
            <span className="text-lg font-bold tracking-widest text-white">NEXUS</span>
          </div>
          <button onClick={() => setIsMobileOpen(false)} className="md:hidden text-neutral-500 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto custom-scrollbar">
          <div className="text-xs font-semibold text-neutral-500 px-3 mb-2 uppercase tracking-wider">Меню</div>
          {MENU_ITEMS.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link key={item.path} href={item.path} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${isActive ? 'bg-indigo-600/10 text-indigo-400' : 'text-neutral-400 hover:bg-white/5 hover:text-white'}`}>
                {item.icon}
                <span className="font-medium text-sm">{item.name}</span>
                {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />}
              </Link>
            );
          })}
        </nav>

        {/* КНОПКА АДМИНКИ (ТОЛЬКО ДЛЯ АДМИНОВ И СОЗДАТЕЛЕЙ) */}
        {(userRole === 'admin' || userRole === 'creator') && (
          <div className="px-3 mb-2">
            <Link 
              href="/admin" 
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group border ${
                pathname === '/admin' 
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20' 
                  : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20'
              }`}
            >
              <Shield size={20} className={pathname === '/admin' ? '' : 'group-hover:scale-110 transition-transform'} />
              <span className="font-bold text-sm tracking-wider uppercase">Админка</span>
            </Link>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-white/5 relative">
          
          <div className={`mb-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-500 ${
             !isOnline ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 
             pendingCount > 0 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : // Желтый при очереди
             isSyncing ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
             'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          }`}>
             {!isOnline ? <WifiOff size={12} /> : 
              pendingCount > 0 ? <CloudOff size={12} /> : // Иконка облака с крестиком
              isSyncing ? <RefreshCw size={12} className="animate-spin"/> : <Wifi size={12} />
             }
             <span>
               {!isOnline ? 'Автономный режим' : 
                pendingCount > 0 ? `Не сохранено: ${pendingCount}` : 
                isSyncing ? 'Синхронизация...' : 'Система в сети'
               }
             </span>
          </div>

          {!isEditing ? (
            <div className="flex items-center gap-3 px-3 py-2 mb-2 rounded-xl bg-white/5 group relative">
              <div className="w-8 h-8 rounded-full bg-neutral-800 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                 {avatarUrl ? (
                   <img 
                     src={avatarUrl} 
                     alt="Ava" 
                     className="w-full h-full object-cover"
                     onError={() => setAvatarUrl(null)}
                   />
                 ) : (
                   <UserCircle size={32} className="text-neutral-400" />
                 )}
              </div>
              <div className="overflow-hidden flex-1">
                <div className="text-xs font-medium text-white truncate">
                  {user?.user_metadata?.full_name || 'Commander'}
                </div>
                <div className="text-[10px] text-neutral-500 truncate">{user?.email}</div>
              </div>
              <button 
                onClick={() => { setIsEditing(true); setNewName(user?.user_metadata?.full_name || ''); }}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 transition ${isTouch ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              >
                <Edit2 size={14} />
              </button>
            </div>
          ) : (
            <div className="bg-neutral-900 rounded-xl p-3 mb-2 border border-indigo-500/30 animate-in zoom-in-95">
               <div className="text-[10px] text-indigo-400 font-bold mb-2 uppercase">Новое имя</div>
               <input value={newName} onChange={e => { setNewName(e.target.value); setEditError(null); }} className="w-full bg-neutral-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white mb-2 focus:outline-none focus:border-indigo-500" placeholder="Имя..."/>
               {editError && <div className="text-[10px] text-rose-400 mb-2 flex items-center gap-1"><AlertTriangle size={10}/>{editError}</div>}
               <div className="flex gap-2">
                  <button disabled={editLoading} onClick={() => setIsEditing(false)} className="flex-1 py-1 rounded-md bg-white/5 hover:bg-white/10 text-neutral-400 text-xs"><X size={14} className="mx-auto"/></button>
                  <button disabled={editLoading} onClick={handleUpdateName} className="flex-1 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs flex items-center justify-center">
                    {editLoading ? <Loader2 size={14} className="animate-spin"/> : <Check size={14}/>}
                  </button>
               </div>
            </div>
          )}
          
          <button 
            onClick={toggleNotifications}
            className={`flex items-center gap-3 px-3 py-2 w-full rounded-xl transition mb-1 ${
              notificationsEnabled 
                ? 'text-neutral-500 hover:text-white hover:bg-white/5' 
                : 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
            }`}
          >
            {notificationsEnabled ? <Bell size={18} /> : <BellOff size={18} />}
            <span className="text-sm font-medium">
              {notificationsEnabled ? 'Уведомления вкл.' : 'Включить напоминания'}
            </span>
          </button>

          <Link href="/update-password" className="flex items-center gap-3 px-3 py-2 w-full rounded-xl text-neutral-500 hover:text-white hover:bg-white/5 transition mb-1">
            <Lock size={18} />
            <span className="text-sm font-medium">Сменить пароль</span>
          </Link>

          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 w-full rounded-xl text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition">
            <LogOut size={18} />
            <span className="text-sm font-medium">Выйти из системы</span>
          </button>
        </div>
      </aside>
    </>
  );
}