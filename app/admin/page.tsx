"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { 
  Shield, Users, Activity, Crown, ShieldAlert, 
  User as UserIcon, Loader2, Clock, Ban, CheckCircle, 
  Megaphone, Wrench, BarChart3, Ticket, Trash2, 
  MessageSquareReply
} from 'lucide-react';

interface Profile {
  id: string; email: string; username: string; avatar_url: string;
  role: 'user' | 'admin' | 'creator'; last_seen: string; is_banned: boolean;
}

interface Ticket {
  id: string; user_id: string; category: string; message: string; status: string; created_at: string;
  requires_feedback: boolean; admin_reply: string | null;
  profiles: { username: string; email: string; avatar_url: string; }; 
}

export default function AdminPage() {
  const router = useRouter();
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'system' | 'stats' | 'tickets'>('users');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // Данные
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [maintenance, setMaintenance] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const initAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push('/auth');

      const { data: currentProfile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      const role = currentProfile?.role || 'user';
      setCurrentUserRole(role);

      if (role === 'user') return router.push('/');

      // Грузим пользователей
      const { data: allProfiles } = await supabase.from('profiles').select('*').order('role', { ascending: true });
      if (allProfiles) setProfiles(allProfiles as Profile[]);

      // Грузим настройки системы
      const { data: sysSettings } = await supabase.from('system_settings').select('maintenance_mode').single();
      if (sysSettings) setMaintenance(sysSettings.maintenance_mode);

      // Грузим статистику (через нашу новую функцию)
      const { data: sysStats } = await supabase.rpc('get_system_stats');
      if (sysStats) setStats(sysStats);

      // Грузим тикеты со связью с профилями
      const { data: allTickets } = await supabase
        .from('support_tickets')
        .select('*, profiles(username, email, avatar_url)')
        .order('created_at', { ascending: false });
      if (allTickets) setTickets(allTickets as any);

      setLoading(false);
    };
    initAdmin();
  }, [router]);

  // --- ДЕЙСТВИЯ ---

  const toggleRole = async (targetId: string, currentRole: string) => {
    if (currentUserRole !== 'creator') return alert('Нет прав!');
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    setActionLoading(`role_${targetId}`);
    try {
      await supabase.rpc('update_user_role', { target_user_id: targetId, new_role: newRole });
      setProfiles(profiles.map(p => p.id === targetId ? { ...p, role: newRole as any } : p));
    } finally { setActionLoading(null); }
  };

  const toggleBan = async (targetId: string, isBanned: boolean) => {
    setActionLoading(`ban_${targetId}`);
    try {
      await supabase.rpc('toggle_user_ban', { target_id: targetId, ban_status: !isBanned });
      setProfiles(profiles.map(p => p.id === targetId ? { ...p, is_banned: !isBanned } : p));
    } finally { setActionLoading(null); }
  };

  const handleCloseTicket = async (ticketId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'open' ? 'closed' : 'open';
    setActionLoading(`ticket_${ticketId}`);
    try {
      await supabase.rpc('update_ticket_status', { p_ticket_id: ticketId, p_status: newStatus });
      setTickets(tickets.map(t => t.id === ticketId ? { ...t, status: newStatus } : t));
    } finally { setActionLoading(null); }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    if (!confirm('Точно удалить тикет?')) return;
    setActionLoading(`delete_${ticketId}`);
    try {
      await supabase.rpc('delete_support_ticket', { p_ticket_id: ticketId });
      setTickets(tickets.filter(t => t.id !== ticketId));
    } finally { setActionLoading(null); }
  };

  const handleSendReply = async (ticketId: string) => {
    if (!replyText.trim()) return;
    setActionLoading(`reply_${ticketId}`);
    try {
      await supabase.rpc('reply_to_ticket', { p_ticket_id: ticketId, p_reply: replyText });
      setTickets(tickets.map(t => t.id === ticketId ? { ...t, status: 'closed', admin_reply: replyText } : t));
      setReplyingTo(null);
      setReplyText('');
    } finally { setActionLoading(null); }
  };

  const handleMaintenanceToggle = async () => {
    const newStatus = !maintenance;
    setMaintenance(newStatus);
    await supabase.rpc('set_maintenance_mode', { status: newStatus });
  };

  const handlePostAnnouncement = async () => {
    setActionLoading('announcement');
    await supabase.rpc('post_announcement', { p_message: announcement });
    setActionLoading(null);
    alert('Объявление обновлено!');
    setAnnouncement('');
  };

  if (loading) return <div className="h-full flex items-center justify-center text-indigo-500"><Loader2 className="animate-spin" size={32} /></div>;

  return (
    <div className="flex flex-col h-full bg-transparent text-main animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0 bg-card/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
            <Shield size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold">Панель Управления</h1>
            <p className="text-[10px] text-muted font-mono uppercase tracking-wider">
              Доступ: {currentUserRole === 'creator' ? 'Создатель (Полный)' : 'Администратор'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 max-w-5xl mx-auto w-full space-y-6">
        
        {/* TABS */}
        <div className="flex overflow-x-auto custom-scrollbar gap-2 p-1 bg-neutral-900 rounded-xl border border-white/5 mb-6 max-w-full md:w-fit">
          <button onClick={() => setActiveTab('users')} className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${activeTab === 'users' ? 'bg-white/10 text-white' : 'text-neutral-500 hover:text-white'}`}><Users size={16}/> Пользователи</button>
          <button onClick={() => setActiveTab('system')} className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${activeTab === 'system' ? 'bg-amber-500/10 text-amber-500' : 'text-neutral-500 hover:text-white'}`}><Wrench size={16}/> Система</button>
          <button onClick={() => setActiveTab('stats')} className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${activeTab === 'stats' ? 'bg-emerald-500/10 text-emerald-500' : 'text-neutral-500 hover:text-white'}`}><BarChart3 size={16}/> Статистика</button>
          <button onClick={() => setActiveTab('tickets')} className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${activeTab === 'tickets' ? 'bg-indigo-500/10 text-indigo-400' : 'text-neutral-500 hover:text-white'}`}>
            <Ticket size={16}/> Тикеты
            {tickets.filter(t => t.status === 'open').length > 0 && (
              <span className="bg-indigo-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1">
                {tickets.filter(t => t.status === 'open').length}
              </span>
            )}
          </button>
        </div>

        {/* --- TAB: УПРАВЛЕНИЕ СИСТЕМОЙ --- */}
        {activeTab === 'system' && (
          <div className="space-y-6 animate-in fade-in">
            {/* Maintenance Mode */}
            <div className="bg-card rounded-2xl border border-rose-500/20 p-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><Wrench size={18} className="text-amber-500"/> Режим обслуживания</h3>
                <p className="text-sm text-neutral-400 mt-1">Закрывает доступ к Nexus OS для всех обычных пользователей. Вы по-прежнему сможете войти.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={maintenance} onChange={handleMaintenanceToggle} className="sr-only peer"/>
                <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            {/* Global Announcement */}
            <div className="bg-card rounded-2xl border border-indigo-500/20 p-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4"><Megaphone size={18} className="text-indigo-500"/> Глобальное объявление</h3>
              <textarea 
                value={announcement} onChange={(e) => setAnnouncement(e.target.value)}
                placeholder="Текст появится на главной странице у всех пользователей..."
                className="w-full bg-neutral-900 border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-indigo-500 min-h-[100px] mb-4"
              />
              <div className="flex gap-3">
                <button onClick={handlePostAnnouncement} disabled={actionLoading === 'announcement'} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition flex items-center gap-2">
                  {actionLoading === 'announcement' ? <Loader2 size={16} className="animate-spin"/> : 'Опубликовать'}
                </button>
                <button onClick={() => { setAnnouncement(''); handlePostAnnouncement(); }} className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium transition">
                  Очистить (Удалить объявление)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: СТАТИСТИКА --- */}
        {activeTab === 'stats' && stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in">
            <div className="bg-card rounded-2xl border border-white/5 p-6 flex flex-col items-center justify-center text-center">
               <Users size={24} className="text-indigo-400 mb-2"/>
               <div className="text-3xl font-bold text-white">{stats.users}</div>
               <div className="text-xs text-neutral-500 uppercase tracking-widest mt-1">Профилей</div>
            </div>
            <div className="bg-card rounded-2xl border border-white/5 p-6 flex flex-col items-center justify-center text-center">
               <CheckCircle size={24} className="text-emerald-400 mb-2"/>
               <div className="text-3xl font-bold text-white">{stats.tasks}</div>
               <div className="text-xs text-neutral-500 uppercase tracking-widest mt-1">Всего задач</div>
            </div>
            <div className="bg-card rounded-2xl border border-white/5 p-6 flex flex-col items-center justify-center text-center">
               <Activity size={24} className="text-amber-400 mb-2"/>
               <div className="text-3xl font-bold text-white">{stats.transactions}</div>
               <div className="text-xs text-neutral-500 uppercase tracking-widest mt-1">Транзакций</div>
            </div>
            <div className="bg-card rounded-2xl border border-white/5 p-6 flex flex-col items-center justify-center text-center">
               <BarChart3 size={24} className="text-purple-400 mb-2"/>
               <div className="text-3xl font-bold text-white">{stats.notes}</div>
               <div className="text-xs text-neutral-500 uppercase tracking-widest mt-1">Заметок (Brain)</div>
            </div>
          </div>
        )}

        {/* --- TAB: ПОЛЬЗОВАТЕЛИ --- */}
        {activeTab === 'users' && (
          <div className="bg-card rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5 animate-in fade-in">
            {profiles.map((p) => (
              <div key={p.id} className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition ${p.is_banned ? 'bg-rose-950/20' : 'hover:bg-white/5'}`}>
                
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-neutral-800 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 relative">
                    {p.avatar_url ? <img src={p.avatar_url} alt="Ava" className="w-full h-full object-cover" /> : <UserIcon size={20} className="text-neutral-500" />}
                    {p.is_banned && <div className="absolute inset-0 bg-rose-500/50 flex items-center justify-center backdrop-blur-[1px]"><Ban size={16} className="text-white"/></div>}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${p.is_banned ? 'text-rose-400 line-through' : 'text-white'}`}>{p.username || p.email.split('@')[0]}</span>
                      {p.role === 'creator' && <span className="flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full"><Crown size={10}/> Creator</span>}
                      {p.role === 'admin' && <span className="flex items-center gap-1 text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full"><ShieldAlert size={10}/> Admin</span>}
                    </div>
                    <div className="text-xs text-muted font-mono mt-1">{p.email}</div>
                    <div className="text-[10px] text-neutral-600 flex items-center gap-1 mt-1.5 font-medium uppercase tracking-tight">
                      <Clock size={10} className="text-neutral-700" />
                      Активность: {p.last_seen ? new Date(p.last_seen).toLocaleString('ru-RU', { 
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                      }) : 'Нет данных'}
                    </div>
                  </div>
                </div>

                {/* Кнопки управления */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Кнопка бана (можно банить всех, кроме Creator) */}
                  {p.role !== 'creator' && (
                    <button onClick={() => toggleBan(p.id, p.is_banned)} disabled={actionLoading === `ban_${p.id}`} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 border ${p.is_banned ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                      {actionLoading === `ban_${p.id}` ? <Loader2 size={14} className="animate-spin"/> : <Ban size={14}/>}
                      {p.is_banned ? 'Разблокировать' : 'Забанить'}
                    </button>
                  )}
                  
                  {/* Кнопка роли (Только для Creator) */}
                  {currentUserRole === 'creator' && p.role !== 'creator' && (
                    <button onClick={() => toggleRole(p.id, p.role)} disabled={actionLoading === `role_${p.id}`} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-800 text-neutral-300 hover:text-white border border-white/5">
                      {actionLoading === `role_${p.id}` ? <Loader2 size={14} className="animate-spin"/> : (p.role === 'admin' ? '- Права' : '+ Админ')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* --- TAB: ТИКЕТЫ --- */}
        {activeTab === 'tickets' && (
          <div className="space-y-4 animate-in fade-in">
            {tickets.length === 0 ? (
              <div className="text-center py-10 text-neutral-500">Нет новых обращений</div>
            ) : (
              tickets.map(t => (
                <div key={t.id} className={`bg-card rounded-2xl border p-5 transition ${t.status === 'closed' ? 'border-white/5 opacity-60' : 'border-indigo-500/20'}`}>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    
                    {/* Автор тикета */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-neutral-800 border border-white/10 overflow-hidden shrink-0">
                        {t.profiles?.avatar_url ? <img src={t.profiles.avatar_url} className="w-full h-full object-cover"/> : <UserIcon size={16} className="m-auto mt-2.5 text-neutral-500"/>}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{t.profiles?.username || 'Без имени'}</div>
                        <div className="text-[10px] text-muted font-mono">{t.profiles?.email}</div>
                      </div>
                    </div>

                    {/* Мета-данные */}
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                        t.category === 'bug' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                        t.category === 'feature' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        {t.category === 'bug' ? 'Баг' : t.category === 'feature' ? 'Идея' : 'Вопрос'}
                      </span>
                      <span className="text-[10px] text-neutral-600">{new Date(t.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Текст сообщения */}
                  <div className="bg-neutral-900/50 rounded-xl p-4 text-sm text-neutral-300 border border-white/5 whitespace-pre-wrap mb-4">
                    {t.message}
                  </div>

                  {/* Статус ответа */}
              {t.admin_reply && (
                 <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 mb-4 text-sm text-indigo-300">
                    <span className="font-bold text-indigo-400 block mb-1">Ответ администратора:</span>
                    {t.admin_reply}
                 </div>
              )}

              {/* Поле для написания ответа */}
              {replyingTo === t.id && (
                 <div className="mb-4 flex flex-col gap-2">
                    <textarea 
                      value={replyText} onChange={e => setReplyText(e.target.value)}
                      placeholder="Напишите ответ пользователю..."
                      className="w-full bg-neutral-950 border border-indigo-500/30 rounded-xl p-3 text-sm text-white focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                       <button onClick={() => setReplyingTo(null)} className="px-3 py-1.5 text-xs text-muted hover:text-white">Отмена</button>
                       <button onClick={() => handleSendReply(t.id)} disabled={actionLoading === `reply_${t.id}`} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center gap-2">
                         {actionLoading === `reply_${t.id}` ? <Loader2 size={14} className="animate-spin"/> : <MessageSquareReply size={14}/>} Отправить ответ
                       </button>
                    </div>
                 </div>
              )}

              {/* Действия */}
              <div className="flex items-center justify-between mt-2">
                {/* Метка "Ждет ответа" */}
                <div>
                  {t.requires_feedback && t.status === 'open' && (
                     <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-1 rounded-md font-medium animate-pulse">
                        Требуется ответ
                     </span>
                  )}
                </div>

                {/* Кнопки */}
                <div className="flex items-center gap-2">
                  <button onClick={() => handleDeleteTicket(t.id)} disabled={actionLoading === `delete_${t.id}`} className="p-2 rounded-xl text-neutral-500 hover:bg-rose-500/10 hover:text-rose-400 transition">
                     {actionLoading === `delete_${t.id}` ? <Loader2 size={16} className="animate-spin"/> : <Trash2 size={16}/>}
                  </button>

                  {!t.admin_reply && t.status === 'open' && (
                     <button onClick={() => { setReplyingTo(t.id); setReplyText(''); }} className="px-4 py-2 rounded-xl text-xs font-medium bg-white/5 hover:bg-white/10 text-white transition">
                       Ответить
                     </button>
                  )}

                  <button onClick={() => handleCloseTicket(t.id, t.status)} disabled={actionLoading === `ticket_${t.id}`} className={`px-4 py-2 rounded-xl text-xs font-medium transition flex items-center gap-2 ${t.status === 'open' ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-white/5 hover:bg-white/10 text-white'}`}>
                    {actionLoading === `ticket_${t.id}` ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle size={14}/>}
                    {t.status === 'open' ? 'Пометить как решенное' : 'Открыть заново'}
                  </button>
                </div>
              </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}