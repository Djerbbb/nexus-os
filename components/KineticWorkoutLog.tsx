'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Play, Save, ChevronDown, ChevronUp, Battery, Smile, Plus, Trash2, Loader2, Calendar, Edit2, X, Brain, CheckSquare, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { logEvent } from '@/lib/log';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

export default function KineticWorkoutLog() {
  const searchParams = useSearchParams();
  const targetId = searchParams?.get('id');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [templates, setTemplates] = useState<any[]>([]);
  const [exercises, setExercises] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  
  // Экосистема Nexus
  const [notes, setNotes] = useState<any[]>([]);
  const [todos, setTodos] = useState<any[]>([]);
  const [activeNoteModal, setActiveNoteModal] = useState<any>(null);

  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [workoutName, setWorkoutName] = useState('');
  const [energy, setEnergy] = useState(5);
  const [mood, setMood] = useState(5);
  const [workoutData, setWorkoutData] = useState<Record<string, any[]>>({});
  
  // Состояния для добавления упражнения "на лету"
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [extraExerciseId, setExtraExerciseId] = useState('');

  const [expandedWorkout, setExpandedWorkout] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (targetId && workouts.some(w => w.id === targetId)) {
      setExpandedWorkout(targetId);
      
      setTimeout(() => {
        const el = document.getElementById(`workout-${targetId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [targetId, workouts]);

  async function fetchData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [tplRes, exRes, wrkRes, notesRes, todosRes] = await Promise.all([
      supabase.from('kinetic_templates').select('*').order('created_at', { ascending: false }),
      supabase.from('kinetic_exercises').select('*'),
      supabase.from('kinetic_workouts').select('*').order('created_at', { ascending: false }),
      supabase.from('notes').select('id, title, content'),
      supabase.from('todos').select('*').eq('is_complete', false)
    ]);

    if (tplRes.data) setTemplates(tplRes.data);
    if (exRes.data) setExercises(exRes.data);
    if (wrkRes.data) setWorkouts(wrkRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (todosRes.data) setTodos(todosRes.data);
    setLoading(false);
  }

  function handleSelectTemplate(tplId: string) {
    setSelectedTemplate(tplId);
    if (!tplId) return;

    const tpl = templates.find(t => t.id === tplId);
    if (tpl && !editingWorkoutId) {
      setWorkoutName(`${tpl.name} - ${format(new Date(), 'dd MMM', { locale: ru })}`);
      const initialData: Record<string, any[]> = {};
      tpl.exercise_ids.forEach((exId: string) => {
        const ex = exercises.find(e => e.id === exId);
        if (ex) initialData[exId] = [{ weight: '', reps: '', time: '', distance: '', duration: '' }];
      });
      setWorkoutData(initialData);
    }
  }

  function addSet(exId: string) {
    setWorkoutData(prev => ({ ...prev, [exId]: [...(prev[exId] || []), { weight: '', reps: '', time: '', distance: '', duration: '' }] }));
  }

  function removeSet(exId: string, index: number) {
    setWorkoutData(prev => {
      const newSets = [...prev[exId]];
      newSets.splice(index, 1);
      return { ...prev, [exId]: newSets };
    });
  }

  function updateSet(exId: string, index: number, field: string, value: string) {
    setWorkoutData(prev => {
      const newSets = [...prev[exId]];
      newSets[index] = { ...newSets[index], [field]: value };
      return { ...prev, [exId]: newSets };
    });
  }

  function addExtraExercise() {
    if (!extraExerciseId) return;
    const ex = exercises.find(e => e.id === extraExerciseId);
    if (ex) {
      setWorkoutData(prev => ({
        ...prev,
        [extraExerciseId]: [{ weight: '', reps: '', time: '', distance: '', duration: '' }]
      }));
    }
    setShowAddExercise(false);
    setExtraExerciseId('');
  }

  async function saveWorkout() {
    if (!selectedTemplate && !editingWorkoutId) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    const snapshotResults: Record<string, any> = {};
    Object.keys(workoutData).forEach(exId => {
      const ex = exercises.find(e => e.id === exId);
      const oldExData = editingWorkoutId ? workouts.find(w => w.id === editingWorkoutId)?.results?.[exId] : null;
      snapshotResults[exId] = {
        name: ex?.name || (oldExData && !Array.isArray(oldExData) ? oldExData.name : 'Удаленное упражнение'),
        type: ex?.type || (oldExData && !Array.isArray(oldExData) ? oldExData.type : 'weight_reps'),
        sets: workoutData[exId]
      };
    });

    const payload = {
      user_id: user?.id,
      template_id: selectedTemplate || null,
      name: workoutName,
      energy_level: energy,
      mood_level: mood,
      results: snapshotResults
    };

    let savedWorkout = null;
    if (editingWorkoutId) {
      const { data } = await supabase.from('kinetic_workouts').update(payload).eq('id', editingWorkoutId).select().single();
      if (data) { 
        setWorkouts(workouts.map(w => w.id === editingWorkoutId ? data : w)); 
        savedWorkout = data; 
        await logEvent('kinetic', 'update', `Обновлена тренировка: ${payload.name}`, { target_id: data.id }); // <--- Лог обновления
      }
    } else {
      const { data } = await supabase.from('kinetic_workouts').insert([payload]).select().single();
      if (data) { 
        setWorkouts([data, ...workouts]); 
        savedWorkout = data; 
        await logEvent('kinetic', 'create', `Проведена тренировка: ${payload.name}`, { target_id: data.id }); // <--- Лог создания
      }
    }

    if (savedWorkout && !editingWorkoutId && selectedTemplate) {
      const tpl = templates.find(t => t.id === selectedTemplate);
      if (tpl) {
        const matchingTodo = todos.find(t => t.title.toLowerCase().includes(tpl.name.toLowerCase()));
        if (matchingTodo) {
          await supabase.from('todos').update({ is_complete: true }).eq('id', matchingTodo.id);
          setTodos(todos.filter(t => t.id !== matchingTodo.id));
        }
      }
    }

    cancelEdit();
    setSaving(false);
  }

  function editWorkout(w: any) {
    setEditingWorkoutId(w.id);
    setSelectedTemplate(w.template_id || '');
    setWorkoutName(w.name);
    setEnergy(w.energy_level || 5);
    setMood(w.mood_level || 5);

    const restoredData: Record<string, any[]> = {};
    Object.keys(w.results || {}).forEach(exId => {
      const item = w.results[exId];
      restoredData[exId] = Array.isArray(item) ? item : item.sets;
    });
    setWorkoutData(restoredData);
    setExpandedWorkout(null);
  }

  function cancelEdit() {
    setEditingWorkoutId(null);
    setSelectedTemplate('');
    setWorkoutName('');
    setWorkoutData({});
    setEnergy(5);
    setMood(5);
    setShowAddExercise(false);
  }

  async function deleteWorkout(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm('Удалить эту тренировку из истории?')) return;
    await supabase.from('kinetic_workouts').delete().eq('id', id);
    await logEvent('kinetic', 'delete', `Удалена запись о тренировке`, { target_id: id }); // <--- Лог удаления
    setWorkouts(workouts.filter(w => w.id !== id));
    if (editingWorkoutId === id) cancelEdit();
  }

  function renderSetInputs(exId: string, type: string, setIndex: number, setData: any) {
    if (type === 'weight_reps') {
      return (
        <>
          <input type="number" placeholder="Вес" value={setData.weight || ''} onChange={e => updateSet(exId, setIndex, 'weight', e.target.value)} className="w-16 sm:w-20 bg-neutral-900 border border-white/10 rounded px-2 py-1 text-sm text-white text-center" />
          <span className="text-neutral-500 text-sm">x</span>
          <input type="number" placeholder="Повт." value={setData.reps || ''} onChange={e => updateSet(exId, setIndex, 'reps', e.target.value)} className="w-16 sm:w-20 bg-neutral-900 border border-white/10 rounded px-2 py-1 text-sm text-white text-center" />
        </>
      );
    }
    if (type === 'time_distance') {
      return (
        <>
          <input type="text" placeholder="Время" value={setData.time || ''} onChange={e => updateSet(exId, setIndex, 'time', e.target.value)} className="w-20 sm:w-24 bg-neutral-900 border border-white/10 rounded px-2 py-1 text-sm text-white text-center" />
          <input type="number" placeholder="Дист." value={setData.distance || ''} onChange={e => updateSet(exId, setIndex, 'distance', e.target.value)} className="w-20 sm:w-24 bg-neutral-900 border border-white/10 rounded px-2 py-1 text-sm text-white text-center" />
        </>
      );
    }
    return <input type="text" placeholder="Длительность (мин/сек)" value={setData.duration || ''} onChange={e => updateSet(exId, setIndex, 'duration', e.target.value)} className="flex-1 bg-neutral-900 border border-white/10 rounded px-2 py-1 text-sm text-white" />;
  }

  const sportTodos = todos.filter(t => templates.some(tpl => t.title.toLowerCase().includes(tpl.name.toLowerCase())));

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-amber-500" /></div>;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full relative">
        <div className="bg-neutral-800/40 border border-white/5 rounded-2xl flex flex-col h-fit">
          <div className="p-4 sm:p-6 flex-shrink-0 border-b border-white/5 flex justify-between items-center">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Play size={20} className="text-amber-500" /> 
              {editingWorkoutId ? 'Редактирование' : 'Новая тренировка'}
            </h2>
            {editingWorkoutId && (
              <button onClick={cancelEdit} className="text-neutral-400 hover:text-white"><X size={20}/></button>
            )}
          </div>

          <div className="p-4 sm:p-6 flex flex-col gap-6">
            {!editingWorkoutId && (
              <select 
                value={selectedTemplate} onChange={(e) => handleSelectTemplate(e.target.value)}
                className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/50"
              >
                <option value="">-- Выберите программу --</option>
                {templates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
              </select>
            )}

            {(selectedTemplate || editingWorkoutId) && (
              <div className="space-y-6">
                <input 
                  type="text" value={workoutName} onChange={(e) => setWorkoutName(e.target.value)}
                  className="w-full bg-neutral-900/50 border-b border-white/10 px-2 py-2 text-lg text-amber-500 font-medium focus:outline-none focus:border-amber-500/50"
                />

                <div className="space-y-4">
                  {Object.keys(workoutData).map((exId: string) => {
                    const ex = exercises.find(e => e.id === exId);
                    const exName = ex?.name || 'Удаленное упражнение';
                    const exType = ex?.type || 'weight_reps';
                    const sets = workoutData[exId] || [];

                    return (
                      <div key={exId} className="bg-black/20 rounded-xl p-3 sm:p-4 border border-white/5 relative">
                        {ex?.note_id && (
                          <button 
                            onClick={() => setActiveNoteModal(notes.find(n => n.id === ex.note_id))}
                            className="absolute top-4 right-4 text-amber-500 hover:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 p-1.5 rounded-lg transition"
                            title="Читать теорию"
                          >
                            <Brain size={16} />
                          </button>
                        )}

                        <div className="font-medium text-white mb-3 pr-10">{exName}</div>
                        
                        <div className="space-y-2 mb-3">
                          {sets.map((set, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="text-neutral-500 text-xs w-4">{idx + 1}.</span>
                              {renderSetInputs(exId, exType, idx, set)}
                              <button onClick={() => removeSet(exId, idx)} className="ml-auto text-neutral-600 hover:text-rose-400"><Trash2 size={16} /></button>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => addSet(exId)} className="text-xs flex items-center gap-1 text-amber-500/70 hover:text-amber-500 transition">
                          <Plus size={14} /> Добавить подход
                        </button>
                      </div>
                    );
                  })}

                  {/* ДОБАВЛЕНИЕ УПРАЖНЕНИЯ НА ЛЕТУ */}
                  {!showAddExercise ? (
                    <button 
                      onClick={() => setShowAddExercise(true)}
                      className="w-full py-3 border border-dashed border-white/10 rounded-xl text-sm text-neutral-400 hover:text-white hover:border-white/20 transition flex items-center justify-center gap-2"
                    >
                      <Plus size={16} /> Выполнить упражнение вне плана
                    </button>
                  ) : (
                    <div className="bg-black/20 p-4 rounded-xl border border-white/5 flex flex-col sm:flex-row gap-2">
                      <select 
                        value={extraExerciseId} 
                        onChange={(e) => setExtraExerciseId(e.target.value)}
                        className="flex-1 bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                      >
                        <option value="">-- Выберите упражнение --</option>
                        {exercises.filter(ex => !workoutData[ex.id]).map(ex => (
                          <option key={ex.id} value={ex.id}>{ex.name}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button 
                          onClick={addExtraExercise}
                          className="flex-1 sm:flex-none bg-amber-500 text-neutral-950 px-4 py-2 rounded-lg font-medium text-sm hover:bg-amber-400 transition"
                        >
                          Добавить
                        </button>
                        <button 
                          onClick={() => { setShowAddExercise(false); setExtraExerciseId(''); }}
                          className="bg-neutral-800 text-neutral-400 px-3 py-2 rounded-lg hover:text-white transition"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-black/20 rounded-xl p-4 border border-white/5 space-y-4">
                  <h3 className="text-sm font-medium text-neutral-300">Состояние</h3>
                  <div>
                    <div className="flex justify-between text-xs text-neutral-500 mb-1"><span className="flex items-center gap-1"><Battery size={14}/> Энергия: {energy}/10</span></div>
                    <input type="range" min="1" max="10" value={energy} onChange={(e) => setEnergy(parseInt(e.target.value))} className="w-full accent-amber-500" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-neutral-500 mb-1"><span className="flex items-center gap-1"><Smile size={14}/> Настроение: {mood}/10</span></div>
                    <input type="range" min="1" max="10" value={mood} onChange={(e) => setMood(parseInt(e.target.value))} className="w-full accent-amber-500" />
                  </div>
                </div>

                <button 
                  onClick={saveWorkout} disabled={saving}
                  className="w-full mt-2 bg-amber-500 text-neutral-950 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-amber-400 transition disabled:opacity-50"
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {editingWorkoutId ? 'Сохранить изменения' : 'Завершить тренировку'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {sportTodos.length > 0 && (
            <div className="bg-neutral-800/40 border border-white/5 rounded-2xl p-4 sm:p-6 shrink-0">
               <h2 className="text-sm font-bold text-neutral-300 mb-3 flex items-center gap-2">
                 <CheckSquare size={16} className="text-amber-500" /> План на сегодня
               </h2>
               <div className="space-y-2">
                 {sportTodos.map(todo => (
                   <div key={todo.id} className="bg-black/20 p-3 rounded-xl border border-white/5 flex justify-between items-center">
                     <span className="text-sm text-white">{todo.title}</span>
                     <span className="text-xs text-neutral-500 bg-neutral-800 px-2 py-1 rounded">Ждет выполнения</span>
                   </div>
                 ))}
               </div>
            </div>
          )}

          <div className="bg-neutral-800/40 border border-white/5 rounded-2xl p-4 sm:p-6 flex flex-col flex-1 h-full max-h-[80vh] lg:max-h-full">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2 flex-shrink-0">
              <Calendar size={20} className="text-amber-500" /> История
            </h2>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
              {workouts.length === 0 && <p className="text-neutral-500 text-sm text-center mt-4">Пусто</p>}
              
              {workouts.map(w => {
                const isExpanded = expandedWorkout === w.id;
                const dateStr = format(new Date(w.created_at), 'dd MMM yyyy, HH:mm', { locale: ru });
                
                return (
                  <div 
                    key={w.id} 
                    id={`workout-${w.id}`}
                    className="bg-neutral-900/50 rounded-xl border border-white/5 overflow-hidden transition-all"
                  >
                    <div 
                      onClick={() => setExpandedWorkout(isExpanded ? null : w.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition cursor-pointer"
                    >
                      <div className="text-left flex-1 pr-2">
                        <p className="font-medium text-amber-500 truncate">{w.name}</p>
                        <p className="text-xs text-neutral-500">{dateStr}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); editWorkout(w); }} className="p-1.5 text-neutral-500 hover:text-white bg-black/20 rounded-lg transition"><Edit2 size={14} /></button>
                        <button onClick={(e) => deleteWorkout(w.id, e)} className="p-1.5 text-neutral-500 hover:text-rose-400 bg-black/20 rounded-lg transition"><Trash2 size={14} /></button>
                        <div className="w-px h-6 bg-white/10 mx-1"></div>
                        {isExpanded ? <ChevronUp size={16} className="text-neutral-400"/> : <ChevronDown size={16} className="text-neutral-400"/>}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4 pt-0 border-t border-white/5 bg-black/20">
                        <div className="space-y-3 mt-3">
                          {Object.keys(w.results || {}).map(exId => {
                            const data = w.results[exId];
                            const sets = Array.isArray(data) ? data : data.sets;
                            const exName = Array.isArray(data) ? (exercises.find(e => e.id === exId)?.name || 'Удаленное') : data.name;
                            if (!sets || sets.length === 0) return null;

                            return (
                              <div key={exId} className="text-sm">
                                <span className="text-neutral-300 font-medium">{exName}</span>
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {sets.map((s: any, i: number) => (
                                    <span key={i} className="bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded text-xs">
                                      {s.weight ? `${s.weight}кг x ${s.reps}` : s.time ? `${s.time}м / ${s.distance}км` : s.duration}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* МОДАЛЬНОЕ ОКНО ДЛЯ ЧТЕНИЯ ЗАМЕТОК (BRAIN) */}
      {activeNoteModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-white/5 shrink-0">
              <h3 className="font-bold text-amber-500 flex items-center gap-2"><Brain size={18}/> {activeNoteModal.title}</h3>
              <button onClick={() => setActiveNoteModal(null)} className="text-neutral-500 hover:text-white transition"><XCircle size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar text-sm">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                  // Учим парсер рисовать жирный текст
                  strong: ({node, ...props}) => <span className="font-bold text-white" {...props} />,
                  // Курсив
                  em: ({node, ...props}) => <span className="italic text-neutral-400" {...props} />,
                  // Заголовки
                  h1: ({node, ...props}) => <h1 className="text-lg font-bold text-white mt-4 mb-2" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-base font-bold text-white mt-3 mb-2" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-sm font-bold text-amber-500 mt-3 mb-1" {...props} />,
                  // Обычный текст
                  p: ({node, ...props}) => <p className="mb-3 text-neutral-300 leading-relaxed" {...props} />,
                  // Маркированные списки
                  ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-3 space-y-1 text-neutral-300 marker:text-amber-500" {...props} />,
                  // Нумерованные списки
                  ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-neutral-300 marker:text-amber-500" {...props} />,
                  // Элементы списка
                  li: ({node, ...props}) => <li {...props} />,
                  // Ссылки
                  a: ({node, ...props}) => <a className="text-amber-500 hover:underline" {...props} />,
                  // Цитаты
                  blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-amber-500 pl-3 italic text-neutral-400 my-3" {...props} />,
                  // Код (одиночный и блочный)
                  code: ({node, inline, className, children, ...props}: any) => 
                    inline 
                      ? <code className="bg-neutral-800 text-amber-400 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
                      : <code className="block bg-neutral-800 p-3 rounded-lg text-xs font-mono text-neutral-300 overflow-x-auto my-3 border border-white/5" {...props}>{children}</code>
                }}
              >
                {activeNoteModal.content || 'Заметка пуста.'}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </>
  );
}