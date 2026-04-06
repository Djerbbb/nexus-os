'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Save, Scale, Ruler, TrendingUp, Loader2, Activity, Trash2, History } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

export default function KineticBiometrics() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [biometrics, setBiometrics] = useState<any[]>([]);

  // Состояния формы
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [chest, setChest] = useState('');
  const [waist, setWaist] = useState('');
  const [biceps, setBiceps] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Получаем замеры, сортируем по дате по возрастанию (для графика)
    const { data, error } = await supabase
      .from('kinetic_biometrics')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error && data) {
      setBiometrics(data);
    }
    setLoading(false);
  }

  async function saveBiometrics() {
    // Если вообще ничего не ввели, не сохраняем
    if (!weight && !bodyFat && !chest && !waist && !biceps) return;
    
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    // Находим последний замер, чтобы перенести из него недостающие данные
    const latest = biometrics.length > 0 ? biometrics[biometrics.length - 1] : null;

    const finalMeasurements = {
      chest: chest ? parseFloat(chest) : (latest?.measurements?.chest || null),
      waist: waist ? parseFloat(waist) : (latest?.measurements?.waist || null),
      biceps: biceps ? parseFloat(biceps) : (latest?.measurements?.biceps || null),
    };

    const payload = {
      user_id: user?.id,
      weight: weight ? parseFloat(weight) : (latest?.weight || null),
      body_fat: bodyFat ? parseFloat(bodyFat) : (latest?.body_fat || null),
      measurements: finalMeasurements
    };

    const { data, error } = await supabase.from('kinetic_biometrics').insert([payload]).select().single();

    if (!error && data) {
      setBiometrics([...biometrics, data]);
      // Очистка формы
      setWeight('');
      setBodyFat('');
      setChest('');
      setWaist('');
      setBiceps('');
    }
    setSaving(false);
  }

  async function deleteBiometric(id: string) {
    if (!window.confirm('Точно удалить этот замер?')) return;
    await supabase.from('kinetic_biometrics').delete().eq('id', id);
    setBiometrics(biometrics.filter(b => b.id !== id));
  }

  // --- Подготовка данных ---
  const chartData = biometrics.map(b => ({
    id: b.id,
    date: format(new Date(b.created_at), 'dd MMM, HH:mm', { locale: ru }),
    weight: b.weight,
    bodyFat: b.body_fat,
    chest: b.measurements?.chest,
    waist: b.measurements?.waist,
    biceps: b.measurements?.biceps
  }));

  const latest = biometrics.length > 0 ? biometrics[biometrics.length - 1] : null;
  const previous = biometrics.length > 1 ? biometrics[biometrics.length - 2] : null;

  const renderTrend = (current: number | null, prev: number | null) => {
    if (!prev || !current) return null;
    const diff = current - prev;
    if (diff === 0) return <span className="text-neutral-500 text-xs ml-2">=</span>;
    return diff > 0 
      ? <span className="text-rose-400 text-xs ml-2">+{diff.toFixed(1)}</span>
      : <span className="text-emerald-400 text-xs ml-2">{diff.toFixed(1)}</span>;
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-amber-500" /></div>;

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar pr-2 pb-10">
      
      {/* ДАШБОРД (Краткая статистика) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 flex-shrink-0">
        <div className="bg-neutral-800/40 border border-white/5 p-3 sm:p-4 rounded-2xl flex flex-col justify-center">
          <div className="text-neutral-500 text-xs sm:text-sm flex items-center gap-1 sm:gap-2 mb-1"><Scale size={16}/> Вес</div>
          <div className="text-xl sm:text-2xl font-bold text-white flex items-baseline">
            {latest?.weight ? `${latest.weight} кг` : '--'}
            {renderTrend(latest?.weight, previous?.weight)}
          </div>
        </div>
        <div className="bg-neutral-800/40 border border-white/5 p-3 sm:p-4 rounded-2xl flex flex-col justify-center">
          <div className="text-neutral-500 text-xs sm:text-sm flex items-center gap-1 sm:gap-2 mb-1"><Activity size={16}/> Жир</div>
          <div className="text-xl sm:text-2xl font-bold text-white flex items-baseline">
            {latest?.body_fat ? `${latest.body_fat}%` : '--'}
            {renderTrend(latest?.body_fat, previous?.body_fat)}
          </div>
        </div>
        <div className="bg-neutral-800/40 border border-white/5 p-3 sm:p-4 rounded-2xl flex flex-col justify-center">
          <div className="text-neutral-500 text-xs sm:text-sm flex items-center gap-1 sm:gap-2 mb-1"><Ruler size={16}/> Грудь</div>
          <div className="text-xl sm:text-2xl font-bold text-white flex items-baseline">
            {latest?.measurements?.chest ? `${latest.measurements.chest} см` : '--'}
            {renderTrend(latest?.measurements?.chest, previous?.measurements?.chest)}
          </div>
        </div>
        <div className="bg-neutral-800/40 border border-white/5 p-3 sm:p-4 rounded-2xl flex flex-col justify-center">
          <div className="text-neutral-500 text-xs sm:text-sm flex items-center gap-1 sm:gap-2 mb-1"><Ruler size={16}/> Талия</div>
          <div className="text-xl sm:text-2xl font-bold text-white flex items-baseline">
            {latest?.measurements?.waist ? `${latest.measurements.waist} см` : '--'}
            {renderTrend(latest?.measurements?.waist, previous?.measurements?.waist)}
          </div>
        </div>
        <div className="bg-neutral-800/40 border border-white/5 p-3 sm:p-4 rounded-2xl flex flex-col justify-center">
          <div className="text-neutral-500 text-xs sm:text-sm flex items-center gap-1 sm:gap-2 mb-1"><Ruler size={16}/> Бицепс</div>
          <div className="text-xl sm:text-2xl font-bold text-white flex items-baseline">
            {latest?.measurements?.biceps ? `${latest.measurements.biceps} см` : '--'}
            {renderTrend(latest?.measurements?.biceps, previous?.measurements?.biceps)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[400px]">
        
        {/* ЛЕВАЯ КОЛОНКА: Форма ввода + История */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          
          {/* Форма */}
          <div className="bg-neutral-800/40 border border-white/5 rounded-2xl p-4 sm:p-6 flex flex-col h-fit shrink-0">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Scale size={20} className="text-amber-500" /> Внести замеры
            </h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Вес (кг)</label>
                  <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} placeholder={latest?.weight?.toString() || ''} className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500/50 placeholder:text-neutral-600" />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Жир (%)</label>
                  <input type="number" step="0.1" value={bodyFat} onChange={e => setBodyFat(e.target.value)} placeholder={latest?.body_fat?.toString() || ''} className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500/50 placeholder:text-neutral-600" />
                </div>
              </div>

              <div className="pt-2 border-t border-white/5">
                <label className="block text-xs text-neutral-500 mb-3 mt-1">Объемы (см)</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <span className="block text-xs text-neutral-500 mb-1">Грудь</span>
                    <input type="number" step="0.5" value={chest} onChange={e => setChest(e.target.value)} placeholder={latest?.measurements?.chest?.toString() || ''} className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50 placeholder:text-neutral-600" />
                  </div>
                  <div>
                    <span className="block text-xs text-neutral-500 mb-1">Талия</span>
                    <input type="number" step="0.5" value={waist} onChange={e => setWaist(e.target.value)} placeholder={latest?.measurements?.waist?.toString() || ''} className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50 placeholder:text-neutral-600" />
                  </div>
                  <div>
                    <span className="block text-xs text-neutral-500 mb-1">Бицепс</span>
                    <input type="number" step="0.5" value={biceps} onChange={e => setBiceps(e.target.value)} placeholder={latest?.measurements?.biceps?.toString() || ''} className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50 placeholder:text-neutral-600" />
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={saveBiometrics}
              disabled={saving || (!weight && !bodyFat && !chest && !waist && !biceps)}
              className="w-full mt-6 bg-amber-500 text-neutral-950 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-amber-400 transition disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Сохранить данные
            </button>
          </div>

          {/* История замеров */}
          <div className="bg-neutral-800/40 border border-white/5 rounded-2xl p-4 sm:p-6 flex flex-col flex-1 min-h-[250px] max-h-[400px]">
            <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <History size={16} className="text-amber-500" /> История замеров
            </h2>
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
              {biometrics.length === 0 && <p className="text-xs text-neutral-500 text-center mt-2">Нет записей</p>}
              {/* Рендерим в обратном порядке, чтобы новые были сверху */}
              {[...biometrics].reverse().map(b => (
                <div key={b.id} className="bg-black/20 p-3 rounded-xl border border-white/5 flex justify-between items-center group">
                  <div>
                    <p className="text-xs text-neutral-500 mb-0.5">{format(new Date(b.created_at), 'dd MMM yyyy, HH:mm', { locale: ru })}</p>
                    <div className="text-sm text-neutral-300 flex flex-wrap gap-x-2 gap-y-1">
                      {b.weight && <span>Вес: {b.weight}кг</span>}
                      {b.body_fat && <span>Жир: {b.body_fat}%</span>}
                      {b.measurements?.chest && <span>Грудь: {b.measurements.chest}см</span>}
                      {b.measurements?.waist && <span>Талия: {b.measurements.waist}см</span>}
                      {b.measurements?.biceps && <span>Бицепс: {b.measurements.biceps}см</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteBiometric(b.id)} className="text-neutral-600 hover:text-rose-400 p-2 sm:opacity-0 sm:group-hover:opacity-100 transition">
                    <Trash2 size={16}/>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА: Графики */}
        <div className="lg:col-span-2 bg-neutral-800/40 border border-white/5 rounded-2xl p-4 sm:p-6 flex flex-col">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-amber-500" /> Динамика показателей
          </h2>

          {biometrics.length > 0 ? (
            <div className="flex-1 min-h-[300px] w-full bg-black/20 p-4 rounded-xl border border-white/5">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="date" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#666" fontSize={12} domain={['auto', 'auto']} tickLine={false} axisLine={false} />
                  
                  {/* Широкий прозрачный курсор создает огромную зону для нажатия пальцем */}
                  <Tooltip 
                    cursor={{ stroke: 'rgba(255,255,255,0.05)', strokeWidth: 40 }}
                    contentStyle={{ backgroundColor: '#171717', borderColor: '#333', borderRadius: '8px' }}
                  />
                  
                  <Legend 
                    verticalAlign="top" 
                    height={36} 
                    iconType="circle" 
                    wrapperStyle={{ fontSize: '12px' }} 
                  />

                  {/* isAnimationActive={false} решает проблему блокировки касаний на мобилках */}
                  <Line isAnimationActive={false} type="monotone" dataKey="weight" name="Вес (кг)" stroke="#f59e0b" strokeWidth={3} dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }} activeDot={{ r: 8 }} />
                  
                  {biometrics.some(b => b.body_fat) && (
                    <Line isAnimationActive={false} type="monotone" dataKey="bodyFat" name="Жир (%)" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} activeDot={{ r: 6 }} />
                  )}
                  {biometrics.some(b => b.measurements?.chest) && (
                    <Line isAnimationActive={false} type="monotone" dataKey="chest" name="Грудь (см)" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} activeDot={{ r: 6 }} />
                  )}
                  {biometrics.some(b => b.measurements?.waist) && (
                    <Line isAnimationActive={false} type="monotone" dataKey="waist" name="Талия (см)" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 3 }} activeDot={{ r: 6 }} />
                  )}
                  {biometrics.some(b => b.measurements?.biceps) && (
                    <Line isAnimationActive={false} type="monotone" dataKey="biceps" name="Бицепс (см)" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} activeDot={{ r: 6 }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 text-center bg-black/20 rounded-xl border border-white/5">
              <TrendingUp size={48} className="mb-4 opacity-20" />
              <p>Добавьте хотя бы один замер, чтобы увидеть график прогресса.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}