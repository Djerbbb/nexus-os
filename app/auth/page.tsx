"use client";

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Hexagon, Lock, Mail, User, ArrowRight, Loader2, AlertTriangle, Eye, EyeOff, CheckCircle, ArrowLeft } from 'lucide-react';

export default function AuthPage() {
  const router = useRouter();
  
  // Режимы: 'login' | 'register' | 'recovery'
  const [viewMode, setViewMode] = useState<'login' | 'register' | 'recovery'>('login');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Поля формы
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (viewMode === 'recovery') {
        // --- ВОССТАНОВЛЕНИЕ ПО ИМЕНИ ПОЛЬЗОВАТЕЛЯ ---
        if (!username) throw new Error('Введите имя пользователя');

        // 1. Сами находим почту по имени (юзеру вводить не нужно)
        const { data: foundEmail, error: searchError } = await supabase
          .rpc('get_email_by_username', { username_input: username });

        // Если пользователя нет, можно либо выдать ошибку, либо сказать "Если такой есть - мы отправили" (для безопасности)
        // Но для удобства пока скажем правду:
        if (searchError || !foundEmail) throw new Error('Пользователь с таким именем не найден');
        
        // 2. Отправляем письмо на НАЙДЕННУЮ почту
        const { error } = await supabase.auth.resetPasswordForEmail(foundEmail, {
          redirectTo: 'com.nexus.os://login-callback',
        });
        
        if (error) throw error;
        setSuccessMsg(`Мы отправили ссылку для сброса на почту, привязанную к ${username}. Проверьте Спам!`);
      
      } else if (viewMode === 'login') {
        // --- ВХОД (По имени) ---
        const { data: foundEmail, error: searchError } = await supabase
          .rpc('get_email_by_username', { username_input: username });

        if (searchError) throw searchError;
        if (!foundEmail) throw new Error('Пользователь с таким именем не найден');

        const { error: authError } = await supabase.auth.signInWithPassword({ 
          email: foundEmail, 
          password 
        });
        
        if (authError) throw authError;
        router.push('/'); 

      } else {
        // --- РЕГИСТРАЦИЯ (Имя + Почта + Пароль) ---
        if (!email || !username || !password) throw new Error('Заполните все поля');

        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: username } }
        });

        if (signUpError) {
           if (signUpError.message.includes('User already registered')) throw new Error('Эта почта уже зарегистрирована');
           if (signUpError.message.includes('unique constraint')) throw new Error('Это имя пользователя уже занято');
           throw signUpError;
        }
        
        if (data.session) router.push('/');
        else {
           setError('Аккаунт создан, но авто-вход не сработал. Попробуйте войти вручную.');
           setViewMode('login');
        }
      }
    } catch (err: any) {
      if (err.message?.includes('profiles_username_key')) {
        setError('Это имя пользователя уже занято');
      } else {
        setError(err.message || 'Ошибка');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-neutral-950 p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-grid-white/[0.02] pointer-events-none" />
      <div className="absolute w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl -top-20 -left-20 pointer-events-none" />
      <div className="absolute w-96 h-96 bg-rose-600/10 rounded-full blur-3xl bottom-0 right-0 pointer-events-none" />

      <div className="w-full max-w-md bg-neutral-900/80 border border-white/10 backdrop-blur-xl p-8 rounded-3xl shadow-2xl relative z-10 animate-in zoom-in-95 duration-300">
        
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/30">
            <Hexagon className="text-white fill-white" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-widest">NEXUS OS</h1>
          <p className="text-neutral-500 text-sm">
            {viewMode === 'recovery' ? 'Восстановление доступа' : 'Система авторизации'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-sm animate-in slide-in-from-top-2">
            <AlertTriangle size={18} className="shrink-0" />
            {error}
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-400 text-sm animate-in slide-in-from-top-2">
            <CheckCircle size={18} className="shrink-0" />
            {successMsg}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          
          {/* ИМЯ ПОЛЬЗОВАТЕЛЯ (Нужно всегда: Вход, Регистрация и теперь Восстановление!) */}
          <div className="relative group">
            <User className="absolute left-4 top-3.5 text-neutral-500 group-focus-within:text-indigo-400 transition" size={18} />
            <input 
              type="text" 
              placeholder="Имя пользователя" 
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-indigo-500 transition placeholder:text-neutral-600"
              required
            />
          </div>
          
          {/* Email (Только при регистрации) */}
          {viewMode === 'register' && (
            <div className="relative group animate-in slide-in-from-top-2">
              <Mail className="absolute left-4 top-3.5 text-neutral-500 group-focus-within:text-indigo-400 transition" size={18} />
              <input 
                type="email" 
                placeholder="Электронная почта" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-indigo-500 transition placeholder:text-neutral-600"
              />
            </div>
          )}

          {/* Пароль (Вход или Регистрация) */}
          {viewMode !== 'recovery' && (
            <div className="relative group">
              <Lock className="absolute left-4 top-3.5 text-neutral-500 group-focus-within:text-indigo-400 transition" size={18} />
              <input 
                type={showPassword ? "text" : "password"}
                placeholder="Пароль" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3 pl-12 pr-12 text-white focus:outline-none focus:border-indigo-500 transition placeholder:text-neutral-600"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-3.5 text-neutral-500 hover:text-white transition"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          )}
          
          {/* Ссылка "Забыли пароль?" */}
          {viewMode === 'login' && (
            <div className="flex justify-end">
              <button 
                type="button" 
                onClick={() => { setViewMode('recovery'); setError(null); setSuccessMsg(null); }}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition"
              >
                Забыли пароль?
              </button>
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-xl transition shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : (
              viewMode === 'login' ? 'Войти в систему' : 
              viewMode === 'register' ? 'Создать аккаунт' : 'Сбросить пароль'
            )}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        <div className="mt-6 text-center">
          {viewMode === 'recovery' ? (
             <button 
               onClick={() => { setViewMode('login'); setError(null); setSuccessMsg(null); }} 
               className="flex items-center justify-center gap-2 text-xs text-neutral-400 hover:text-white transition uppercase tracking-wider mx-auto"
             >
               <ArrowLeft size={12} /> Назад ко входу
             </button>
          ) : (
            <button 
              onClick={() => { setViewMode(viewMode === 'login' ? 'register' : 'login'); setError(null); }} 
              className="text-xs text-neutral-400 hover:text-white transition uppercase tracking-wider"
            >
              {viewMode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}