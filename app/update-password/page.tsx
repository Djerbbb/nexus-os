"use client";

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
// 1. Добавили ArrowLeft в импорт
import { Hexagon, Lock, Eye, EyeOff, Loader2, AlertTriangle, ArrowRight, ArrowLeft } from 'lucide-react';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  
  const [password, setPassword] = useState('');

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (password.length < 6) throw new Error('Пароль должен быть не менее 6 символов');

      const { error } = await supabase.auth.updateUser({ password });
      
      if (error) throw error;

      // После успеха перекидываем на главную
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Ошибка смены пароля');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-neutral-950 p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-grid-white/[0.02] pointer-events-none" />
      <div className="absolute w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl -top-20 -left-20 pointer-events-none" />

      <div className="w-full max-w-md bg-neutral-900/80 border border-white/10 backdrop-blur-xl p-8 rounded-3xl shadow-2xl relative z-10 animate-in zoom-in-95 duration-300">
        
        {/* 2. КНОПКА ВОЗВРАТА (НАЗАД) */}
        <button 
          onClick={() => router.push('/')} 
          className="absolute top-6 left-6 text-neutral-500 hover:text-white transition p-2 hover:bg-white/5 rounded-lg"
          title="Вернуться назад"
        >
           <ArrowLeft size={20} />
        </button>

        <div className="flex flex-col items-center mb-8 pt-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/30">
            <Hexagon className="text-white fill-white" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-widest">NEXUS OS</h1>
          <p className="text-neutral-500 text-sm">Установка нового пароля</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-sm">
            <AlertTriangle size={18} className="shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="relative group">
            <Lock className="absolute left-4 top-3.5 text-neutral-500 group-focus-within:text-indigo-400 transition" size={18} />
            <input 
              type={showPassword ? "text" : "password"}
              placeholder="Новый пароль" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3 pl-12 pr-12 text-white focus:outline-none focus:border-indigo-500 transition"
            />
            <button 
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-3.5 text-neutral-500 hover:text-white transition"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}            </button>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-xl transition shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : 'Сохранить и войти'}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}