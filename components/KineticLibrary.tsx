'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Save, Dumbbell, List, Loader2, Brain, Edit2, X } from 'lucide-react';

export const EXERCISE_TYPES = {
  weight_reps: { label: 'Вес + Повторения' },
  time_distance: { label: 'Время + Дистанция' },
  duration: { label: 'Только время' },
};

type ExerciseType = keyof typeof EXERCISE_TYPES;

export default function KineticLibrary() {
  const [exercises, setExercises] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);

  // Состояния для упражнений
  const [newExName, setNewExName] = useState('');
  const [newExType, setNewExType] = useState<ExerciseType>('weight_reps');
  const [newExNoteId, setNewExNoteId] = useState<string>(''); 
  
  // Состояния для шаблонов
  const [newTplName, setNewTplName] = useState('');
  const [selectedExIds, setSelectedExIds] = useState<string[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null); // Режим редактирования

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [exRes, tplRes, notesRes] = await Promise.all([
      supabase.from('kinetic_exercises').select('*').order('created_at', { ascending: false }),
      supabase.from('kinetic_templates').select('*').order('created_at', { ascending: false }),
      supabase.from('notes').select('id, title').order('updated_at', { ascending: false }) 
    ]);

    if (exRes.data) setExercises(exRes.data);
    if (tplRes.data) setTemplates(tplRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    setLoading(false);
  }

  // --- УПРАЖНЕНИЯ ---
  async function addExercise() {
    if (!newExName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase.from('kinetic_exercises').insert([{
      user_id: user?.id,
      name: newExName.trim(),
      type: newExType,
      note_id: newExNoteId ? parseInt(newExNoteId) : null
    }]).select().single();

    if (!error && data) {
      setExercises([data, ...exercises]);
      setNewExName('');
      setNewExNoteId('');
    }
  }

  async function deleteExercise(id: string) {
    if (!window.confirm('Точно удалить это упражнение?')) return;
    await supabase.from('kinetic_exercises').delete().eq('id', id);
    setExercises(exercises.filter(ex => ex.id !== id));
    setSelectedExIds(selectedExIds.filter(exId => exId !== id));
  }

  // --- ШАБЛОНЫ ---
  function toggleExerciseForTemplate(id: string) {
    setSelectedExIds(prev => prev.includes(id) ? prev.filter(exId => exId !== id) : [...prev, id]);
  }

  function editTemplate(tpl: any) {
    setEditingTemplateId(tpl.id);
    setNewTplName(tpl.name);
    setSelectedExIds(tpl.exercise_ids || []);
  }

  function cancelEditTemplate() {
    setEditingTemplateId(null);
    setNewTplName('');
    setSelectedExIds([]);
  }

  async function saveTemplate() {
    if (!newTplName.trim() || selectedExIds.length === 0) return;
    const { data: { user } } = await supabase.auth.getUser();

    if (editingTemplateId) {
      // Обновление существующего шаблона
      const { data, error } = await supabase.from('kinetic_templates')
        .update({ name: newTplName.trim(), exercise_ids: selectedExIds })
        .eq('id', editingTemplateId)
        .select().single();

      if (!error && data) {
        setTemplates(templates.map(t => t.id === editingTemplateId ? data : t));
        cancelEditTemplate();
      }
    } else {
      // Создание нового шаблона
      const { data, error } = await supabase.from('kinetic_templates').insert([{
        user_id: user?.id,
        name: newTplName.trim(),
        exercise_ids: selectedExIds
      }]).select().single();

      if (!error && data) {
        setTemplates([data, ...templates]);
        cancelEditTemplate();
      }
    }
  }

  async function deleteTemplate(id: string) {
    if (!window.confirm('Точно удалить эту программу?')) return;
    await supabase.from('kinetic_templates').delete().eq('id', id);
    setTemplates(templates.filter(tpl => tpl.id !== id));
    if (editingTemplateId === id) cancelEditTemplate();
  }

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-amber-500" /></div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full relative">
      {/* ЛЕВАЯ КОЛОНКА: База упражнений */}
      <div className="bg-neutral-800/40 border border-white/5 rounded-2xl p-4 sm:p-6 flex flex-col h-fit lg:max-h-full">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Dumbbell size={20} className="text-amber-500" /> Библиотека упражнений
        </h2>
        
        <div className="flex flex-col gap-3 mb-6 bg-black/20 p-4 rounded-xl border border-white/5">
          <input 
            type="text" placeholder="Название (напр. Жим лежа)" 
            value={newExName} onChange={(e) => setNewExName(e.target.value)}
            className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
          />
          {/* Исправлено для мобилок: flex-col на телефонах, flex-row на ПК */}
          <div className="flex flex-col sm:flex-row gap-2">
            <select 
              value={newExType} onChange={(e) => setNewExType(e.target.value as ExerciseType)}
              className="w-full sm:flex-1 bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
            >
              {Object.entries(EXERCISE_TYPES).map(([key, info]) => (
                <option key={key} value={key}>{info.label}</option>
              ))}
            </select>
            <select 
              value={newExNoteId} onChange={(e) => setNewExNoteId(e.target.value)}
              className="w-full sm:flex-1 bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="">Без заметки</option>
              {notes.map(n => <option key={n.id} value={n.id}>💡 {n.title}</option>)}
            </select>
            <button onClick={addExercise} className="w-full sm:w-auto bg-amber-500/20 text-amber-500 py-2 px-3 rounded-lg hover:bg-amber-500/30 transition flex items-center justify-center">
              <Plus size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2 pb-6">
          {exercises.length === 0 && <p className="text-neutral-500 text-sm text-center mt-4">Упражнений пока нет</p>}
          {exercises.map(ex => (
            <div key={ex.id} className="flex items-center justify-between p-3 bg-neutral-900/50 rounded-xl border border-white/5 group">
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-2">
                  {ex.name} 
                  {ex.note_id && (
                    <span title="Привязана заметка" className="flex items-center">
                      <Brain size={12} className="text-amber-500" />
                    </span>
                  )}
                </p>
                <p className="text-xs text-neutral-500">{EXERCISE_TYPES[ex.type as ExerciseType]?.label}</p>
              </div>
              <button onClick={() => deleteExercise(ex.id)} className="text-neutral-600 hover:text-rose-400 p-2 sm:opacity-0 sm:group-hover:opacity-100 transition">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ПРАВАЯ КОЛОНКА: Шаблоны */}
      <div className="bg-neutral-800/40 border border-white/5 rounded-2xl p-4 sm:p-6 flex flex-col h-fit lg:max-h-full">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <List size={20} className="text-amber-500" /> 
          {editingTemplateId ? 'Редактирование' : 'Программы тренировок'}
        </h2>
        
        <div className="flex flex-col gap-3 mb-6 bg-black/20 p-4 rounded-xl border border-white/5">
          {/* Исправлено для мобилок: flex-col на телефонах */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input 
              type="text" placeholder="Название (напр. День ног)" 
              value={newTplName} onChange={(e) => setNewTplName(e.target.value)}
              className="w-full sm:flex-1 bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
            />
            {editingTemplateId && (
              <button onClick={cancelEditTemplate} className="w-full sm:w-auto bg-neutral-800 text-neutral-400 px-3 py-2 rounded-lg hover:text-white transition flex items-center justify-center">
                <X size={16} />
              </button>
            )}
            <button 
              onClick={saveTemplate} disabled={!newTplName.trim() || selectedExIds.length === 0}
              className="w-full sm:w-auto bg-amber-500 text-neutral-950 px-4 py-2 rounded-lg hover:bg-amber-400 transition flex items-center justify-center gap-2 disabled:opacity-50 font-medium text-sm"
            >
              <Save size={16} /> {editingTemplateId ? 'Обновить' : 'Сохранить'}
            </button>
          </div>
          
          <div className="text-xs text-neutral-400 mb-1">
            {editingTemplateId ? 'Измените состав упражнений:' : 'Выберите упражнения:'}
          </div>
          <div className="max-h-32 overflow-y-auto custom-scrollbar flex flex-wrap gap-2">
            {exercises.map(ex => (
              <button
                key={`select-${ex.id}`} onClick={() => toggleExerciseForTemplate(ex.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                  selectedExIds.includes(ex.id) ? 'bg-amber-500/20 border-amber-500/50 text-amber-500' : 'bg-neutral-900 border-white/10 text-neutral-400 hover:border-white/30'
                }`}
              >
                {ex.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3 pb-6">
          {templates.map(tpl => (
            <div key={tpl.id} className="p-3 bg-neutral-900/50 rounded-xl border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-amber-500">{tpl.name}</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => editTemplate(tpl)} className="text-neutral-500 hover:text-white transition p-1"><Edit2 size={14} /></button>
                  <button onClick={() => deleteTemplate(tpl.id)} className="text-neutral-600 hover:text-rose-400 transition p-1"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {tpl.exercise_ids.map((id: string) => {
                  const ex = exercises.find(e => e.id === id);
                  return ex ? <span key={id} className="bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded text-xs border border-white/5">{ex.name}</span> : null;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}