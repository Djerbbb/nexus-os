"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Fingerprint, Eye, EyeOff, 
  Bell, Shield, CheckSquare, Brain,
  Camera, User as UserIcon, Loader2,
  LifeBuoy, Send, MessageSquare, Edit2, Check, X, AlertTriangle
} from 'lucide-react';
import { SettingsManager, AppSettings } from '../../lib/settings';
import { NativeBiometric } from 'capacitor-native-biometric';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings>(SettingsManager.get());
  const [biometryAvailable, setBiometryAvailable] = useState(false);

  // --- СОСТОЯНИЯ ТИКЕТА ---
  const [ticketCategory, setTicketCategory] = useState('bug');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketLoading, setTicketLoading] = useState(false);
  const [requiresFeedback, setRequiresFeedback] = useState(false);

  // --- ИСТОРИЯ ТИКЕТОВ ПОЛЬЗОВАТЕЛЯ ---
  const [userTickets, setUserTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // --- Состояние для профиля ---
  const [user, setUser] = useState<User | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // --- Состояния для смены имени ---
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    // Загружаем данные пользователя при открытии настроек
    const getUserProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        setNewName(user.user_metadata?.full_name || user.email?.split('@')[0] || '');
        if (user.user_metadata?.avatar_url) {
          setAvatarUrl(user.user_metadata.avatar_url);
        }
      }
    };
    getUserProfile();
  }, []);

  // --- Функция загрузки фото ---
  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) return;

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}.${fileExt}`; // Имя файла = ID юзера

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const publicUrl = `${data.publicUrl}?t=${new Date().getTime()}`;

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      });

      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user?.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
    } catch (error) {
      console.error('Ошибка:', error);
      alert('Ошибка загрузки фото');
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateName = async () => {
    if (!newName.trim() || !user) return;
    setNameLoading(true); setNameError(null);
    try {
      const { error: dbError } = await supabase.from('profiles').update({ username: newName }).eq('id', user.id);
      if (dbError) throw dbError;
      
      const { data: { user: updatedUser }, error: authError } = await supabase.auth.updateUser({ data: { full_name: newName } });
      if (authError) throw authError;
      
      setUser(updatedUser); 
      setIsEditingName(false);
    } catch (err: any) {
      if (err.message?.includes('unique constraint')) setNameError('Это имя уже занято');
      else setNameError('Ошибка обновления');
    } finally {
      setNameLoading(false);
    }
  };

  useEffect(() => {
    const checkBiometry = async () => {
      if (Capacitor.isNativePlatform()) {
        const result = await NativeBiometric.isAvailable().catch(() => ({ isAvailable: false }));
        setBiometryAvailable(result.isAvailable);
      }
    };
    checkBiometry();
    SettingsManager.applyTheme(settings);
  }, []);

  const handleUpdate = (key: keyof AppSettings, value: any) => {
    const updated = SettingsManager.save({ [key]: value });
    setSettings(updated);
  };

  useEffect(() => {
    const fetchMyTickets = async () => {
      setLoadingTickets(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const { data, error } = await supabase
          .from('support_tickets')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });
          
        if (data && !error) {
          setUserTickets(data);
        }
      }
      setLoadingTickets(false);
    };
    
    fetchMyTickets();
  }, []);

  const handleSendTicket = async () => {
    if (!ticketMessage.trim()) return alert('Введите сообщение');
    setTicketLoading(true);
    try {
      const { error } = await supabase.rpc('create_support_ticket', {
        p_category: ticketCategory,
        p_message: ticketMessage,
        p_requires_feedback: requiresFeedback
      });
      if (error) throw error;
      alert('Ваше сообщение отправлено в поддержку!');
      setTicketMessage(''); 
      setRequiresFeedback(false);
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    } finally {
      setTicketLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-main text-main animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex items-center gap-3 p-6 border-b border-neutral-500/10 shrink-0">
        <button onClick={() => router.back()} className="p-2 -ml-2 hover:bg-white/5 rounded-full transition text-muted hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-light">Настройки</h1>
      </div>



      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">

        {/* === КАРТОЧКА ПРОФИЛЯ === */}
        <div className="bg-card rounded-3xl border border-neutral-500/10 p-6 mb-8 flex flex-col items-center relative overflow-hidden">
           {/* Фон-градиент */}
           <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-indigo-500/20 to-transparent pointer-events-none"/>
           
           <div className="relative group mb-4">
              {/* Круг с фото */}
              <div className="w-28 h-28 rounded-full border-4 border-card bg-neutral-800 shadow-2xl overflow-hidden relative">
                 {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                 ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-600">
                      <UserIcon size={48} />
                    </div>
                 )}
                 {/* Лоадер */}
                 {uploading && (
                   <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
                     <Loader2 size={32} className="animate-spin text-white" />
                   </div>
                 )}
              </div>

              {/* Кнопка-камера (скрытый input) */}
              <label className={`absolute bottom-1 right-1 p-3 bg-indigo-500 hover:bg-indigo-400 text-white rounded-full shadow-lg cursor-pointer transition transform hover:scale-110 active:scale-95 z-10 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                <Camera size={18} />
                <input type="file" accept="image/*" onChange={uploadAvatar} disabled={uploading} className="hidden" />
              </label>
           </div>

           {!isEditingName ? (
             <div className="flex items-center justify-center gap-2 group w-full px-4">
                <h2 className="text-xl font-bold text-main truncate max-w-[200px] text-center">
                  {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Commander'}
                </h2>
                <button 
                   onClick={() => { setIsEditingName(true); setNewName(user?.user_metadata?.full_name || ''); }}
                   className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shrink-0"
                >
                   <Edit2 size={16} />
                </button>
             </div>
           ) : (
             <div className="flex flex-col items-center gap-2 animate-in zoom-in-95 w-full max-w-xs px-4">
                <div className="flex w-full items-center gap-2">
                   <input 
                     value={newName} 
                     onChange={e => { setNewName(e.target.value); setNameError(null); }} 
                     className="flex-1 bg-main border border-neutral-500/20 rounded-xl px-3 py-2 text-sm text-center text-white focus:outline-none focus:border-indigo-500 transition w-full" 
                     placeholder="Новое имя..."
                     autoFocus
                   />
                   <button disabled={nameLoading} onClick={handleUpdateName} className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50 shrink-0">
                     {nameLoading ? <Loader2 size={18} className="animate-spin"/> : <Check size={18}/>}
                   </button>
                   <button disabled={nameLoading} onClick={() => setIsEditingName(false)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 transition disabled:opacity-50 shrink-0">
                     <X size={18} />
                   </button>
                </div>
                {nameError && <div className="text-xs text-rose-400 flex items-center gap-1"><AlertTriangle size={12}/>{nameError}</div>}
             </div>
           )}
           <p className="text-sm text-muted font-mono bg-white/5 px-3 py-1 rounded-full mt-2">
             {user?.email}
           </p>
        </div>

        {/* === ИНТЕРФЕЙС (НОВОЕ) === */}
        <section>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <Eye size={14}/> Интерфейс
          </h2>
          <div className="bg-card rounded-2xl border border-neutral-500/10 overflow-hidden divide-y divide-neutral-500/10">
            
            {/* Глобальный масштаб */}
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                 <div>
                    <div className="text-sm font-medium">Масштаб приложения</div>
                    <div className="text-[10px] text-muted">Размер кнопок, текста и меню</div>
                 </div>
                 <div className="text-xs font-mono bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded">
                    {Math.round((settings.globalTextScale || 1) * 100)}%
                 </div>
              </div>
              
              <div className="flex items-center gap-3">
                 <span className="text-xs text-muted font-bold">A</span>
                 <input 
                   type="range" 
                   min="0.85" 
                   max="1.25" 
                   step="0.05"
                   value={settings.globalTextScale || 1}
                   onChange={(e) => {
                      const newVal = parseFloat(e.target.value);
                      // 1. Сохраняем (функция handleUpdate сама сохранит в localStorage)
                      handleUpdate('globalTextScale', newVal);
                      // 2. Применяем мгновенно
                      document.documentElement.style.setProperty('--app-text-scale', newVal.toString());
                   }}
                   className="flex-1 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                 />
                 <span className="text-lg text-muted font-bold">A</span>
              </div>
              <div className="flex justify-between text-[10px] text-neutral-600 mt-2 px-1 font-mono uppercase">
                 <span>Мелко</span>
                 <span>Стандарт</span>
                 <span>Крупно</span>
              </div>
            </div>

          </div>
        </section>
        
        {/* 1. БЕЗОПАСНОСТЬ */}
        <section>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <Shield size={14}/> Безопасность
          </h2>
          
          <div className="bg-card rounded-2xl border border-neutral-500/10 overflow-hidden divide-y divide-neutral-500/10">
            {/* Биометрия */}
            {biometryAvailable && (
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-primary-20 text-primary rounded-lg"><Fingerprint size={18}/></div>
                   <div>
                     <div className="text-sm font-medium">Вход по биометрии</div>
                     <div className="text-[10px] text-muted">FaceID / Fingerprint</div>
                   </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.useBiometrics} onChange={e => handleUpdate('useBiometrics', e.target.checked)} className="sr-only peer"/>
                  <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            )}

            {/* Скрытие баланса */}
            <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg">{settings.hideBalances ? <EyeOff size={18}/> : <Eye size={18}/>}</div>
                   <div>
                     <div className="text-sm font-medium">Скрывать балансы</div>
                     <div className="text-[10px] text-muted">Заменять цифры на ***</div>
                   </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.hideBalances} onChange={e => handleUpdate('hideBalances', e.target.checked)} className="sr-only peer"/>
                  <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
            </div>
          </div>
        </section>

        {/* 2. ЗАДАЧИ */}
        <section>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <CheckSquare size={14}/> Задачи
          </h2>
          <div className="bg-card rounded-2xl border border-neutral-500/10 overflow-hidden divide-y divide-neutral-500/10">
            
            {/* Авто-архивация */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Авто-архивация</div>
                <div className="text-[10px] text-muted">Скрывать завершенные через 24ч</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={settings.autoArchiveTasks} onChange={e => handleUpdate('autoArchiveTasks', e.target.checked)} className="sr-only peer"/>
                <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* Мой день */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Список «Мой день»</div>
                <div className="text-[10px] text-muted">Поведение в полночь</div>
              </div>
              <select value={settings.myDayCleanup} onChange={e => handleUpdate('myDayCleanup', e.target.value)} className="bg-main border border-neutral-500/10 rounded-lg px-2 py-1 text-xs text-main focus:outline-none">
                <option value="keep">Оставлять</option>
                <option value="clear">Очищать</option>
              </select>
            </div>

            {/* Напоминания */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Напоминание</div>
                <div className="text-[10px] text-muted">Время до дедлайна</div>
              </div>
              <select value={settings.reminderInterval} onChange={e => handleUpdate('reminderInterval', parseInt(e.target.value))} className="bg-main border border-neutral-500/10 rounded-lg px-2 py-1 text-xs text-main focus:outline-none">
                <option value={15}>15 мин</option>
                <option value={60}>1 час</option>
                <option value={180}>3 часа</option>
              </select>
            </div>

            {/* Помодоро */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Таймер фокуса</div>
                <div className="text-[10px] text-muted">Длительность сессии</div>
              </div>
              <select value={settings.pomodoroDuration} onChange={e => handleUpdate('pomodoroDuration', parseInt(e.target.value))} className="bg-main border border-neutral-500/10 rounded-lg px-2 py-1 text-xs text-main focus:outline-none">
                <option value={25}>25 мин</option>
                <option value={45}>45 мин</option>
                <option value={60}>60 мин</option>
              </select>
            </div>
          </div>
        </section>
        
        {/* 3. УВЕДОМЛЕНИЯ */}
        <section>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <Bell size={14}/> Уведомления
          </h2>
          <div className="bg-card rounded-2xl border border-neutral-500/10 overflow-hidden divide-y divide-neutral-500/10">
              
              <div className="flex items-center justify-between p-4">
                  <div>
                     <div className="text-sm font-medium">Утренняя сводка</div>
                     <div className="text-[10px] text-muted">Ежедневный план задач</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={settings.enableMorningBriefing} 
                      onChange={e => handleUpdate('enableMorningBriefing', e.target.checked)} 
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
              </div>

              {settings.enableMorningBriefing && (
                  <div className="flex items-center justify-between p-4 animate-in slide-in-from-top-2">
                      <div className="text-sm font-medium text-muted">Время отправки</div>
                      <select 
                        value={settings.morningBriefingHour} 
                        onChange={e => handleUpdate('morningBriefingHour', parseInt(e.target.value))}
                        className="bg-main border border-neutral-500/10 rounded-lg px-2 py-1 text-xs text-main focus:outline-none focus:border-primary transition"
                      >
                        {Array.from({length: 24}, (_, i) => (
                          <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                        ))}
                      </select>
                  </div>
              )}
          </div>
        </section>
        {/* === ФИНАНСЫ (НОВЫЙ РАЗДЕЛ) === */}
        <section>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="text-emerald-500">$</span> Финансы
          </h2>
          <div className="bg-card rounded-2xl border border-neutral-500/10 overflow-hidden divide-y divide-neutral-500/10">
            
            {/* 1. Курс Доллара */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Курс USD</div>
                <div className="text-[10px] text-muted">Для конвертации валют</div>
              </div>
              <div className="flex items-center gap-2">
                 <span className="text-sm text-muted">1$ =</span>
                 <input 
                   type="number" 
                   value={settings.usdRate} 
                   onChange={e => handleUpdate('usdRate', parseFloat(e.target.value) || 0)}
                   className="w-16 bg-main border border-neutral-500/10 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-emerald-500 transition"
                 />
                 <span className="text-sm text-muted">₽</span>
              </div>
            </div>

            {/* 2. Месячный лимит */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Лимит трат</div>
                <div className="text-[10px] text-muted">Предупреждать при превышении</div>
              </div>
              <div className="flex items-center gap-2">
                 <input 
                   type="number" 
                   value={settings.monthlyLimit} 
                   onChange={e => handleUpdate('monthlyLimit', parseFloat(e.target.value) || 0)}
                   className="w-24 bg-main border border-neutral-500/10 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-rose-500 transition"
                 />
                 <span className="text-sm text-muted">₽</span>
              </div>
            </div>

          </div>
        </section>

        {/* === МОЗГИ (НОВЫЙ РАЗДЕЛ) === */}
        <section>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <Brain size={14}/> Мозги
          </h2>
          <div className="bg-card rounded-2xl border border-neutral-500/10 overflow-hidden divide-y divide-neutral-500/10">
            
            {/* 1. Автосохранение */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Автосохранение</div>
                <div className="text-[10px] text-muted">Сохранять текст при вводе</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={settings.noteAutosave} onChange={e => handleUpdate('noteAutosave', e.target.checked)} className="sr-only peer"/>
                <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {/* 2. Размер шрифта */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">Размер текста</div>
                <div className="text-[10px] text-muted">В редакторе и просмотре</div>
              </div>
              <div className="flex items-center gap-2">
                 <span className="text-xs text-muted">A</span>
                 <input 
                   type="range" 
                   min="12" 
                   max="24" 
                   step="1"
                   value={settings.noteFontSize} 
                   onChange={e => handleUpdate('noteFontSize', parseInt(e.target.value))}
                   className="w-24 accent-indigo-500"
                 />
                 <span className="text-sm font-mono w-6 text-right">{settings.noteFontSize}</span>
              </div>
            </div>

          </div>
        </section>

        {/* === ИСТОРИЯ ОБРАЩЕНИЙ === */}
        {userTickets.length > 0 && (
          <section>
            <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
              <MessageSquare size={14} className="text-indigo-400"/> Мои обращения
            </h2>
            <div className="space-y-3 mb-8">
              {userTickets.map((t) => (
                <div key={t.id} className="bg-card rounded-2xl border border-neutral-500/10 p-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                      t.status === 'open' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'
                    }`}>
                      {t.status === 'open' ? 'В обработке' : 'Решено'}
                    </span>
                    <span className="text-[10px] text-neutral-600">
                      {new Date(t.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <p className="text-sm text-main mb-3 whitespace-pre-wrap">{t.message}</p>

                  {/* ОТВЕТ АДМИНА */}
                  {t.admin_reply && (
                    <div className="bg-indigo-500/5 border-l-2 border-indigo-500 p-3 rounded-r-xl mt-2">
                      <span className="text-[10px] font-bold text-indigo-400 block mb-1 uppercase tracking-tight">Ответ администратора:</span>
                      <p className="text-sm text-indigo-200/90 whitespace-pre-wrap">{t.admin_reply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* === ОБРАТНАЯ СВЯЗЬ (ТИКЕТЫ) === */}
        <section>
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <LifeBuoy size={14} className="text-indigo-400"/> Поддержка и отзывы
          </h2>
          <div className="bg-card rounded-2xl border border-neutral-500/10 p-6 flex flex-col gap-4">
            
            <div className="flex flex-col gap-2">
               <label className="text-xs font-medium text-muted">Категория обращения</label>
               <select 
                 value={ticketCategory} 
                 onChange={e => setTicketCategory(e.target.value)}
                 className="bg-main border border-neutral-500/10 rounded-xl px-3 py-2 text-sm text-main focus:outline-none focus:border-indigo-500 transition"
               >
                 <option value="bug">Техническая ошибка (Баг)</option>
                 <option value="feature">Предложение по улучшению</option>
                 <option value="question">Вопрос по функционалу</option>
                 <option value="other">Другое</option>
               </select>
            </div>

            <div className="flex flex-col gap-2">
               <label className="text-xs font-medium text-muted">Сообщение</label>
               <textarea 
                 value={ticketMessage} 
                 onChange={e => setTicketMessage(e.target.value)}
                 placeholder="Опишите проблему или вашу идею..."
                 className="w-full bg-main border border-neutral-500/10 rounded-xl px-3 py-2 text-sm text-main focus:outline-none focus:border-indigo-500 transition min-h-[100px] custom-scrollbar"
               />
            </div>

            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={requiresFeedback}
                onChange={(e) => setRequiresFeedback(e.target.checked)}
                className="w-4 h-4 rounded border-neutral-500/20 text-indigo-500 focus:ring-indigo-500 bg-neutral-900"
              />
              <span className="text-xs text-muted">Хочу получить ответ от Администрации</span>
            </label>

            <button 
              onClick={handleSendTicket} 
              disabled={ticketLoading || !ticketMessage.trim()}
              className="mt-2 flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition"
            >
              {ticketLoading ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>}
              Отправить сообщение
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}