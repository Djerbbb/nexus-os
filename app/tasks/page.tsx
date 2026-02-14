import React, { Suspense } from 'react';
import TodoWidget from '@/components/TodoWidget';
import { Loader2 } from 'lucide-react';

export default function TasksPage() {
  return (
    <div className="h-full w-full p-4 md:p-6 flex flex-col">
       <div className="flex-1 h-full relative">
         {/* Suspense защищает приложение от падения при чтении параметров URL */}
         <Suspense fallback={
           <div className="flex h-full w-full items-center justify-center">
             <Loader2 className="animate-spin text-neutral-500" size={32} />
           </div>
         }>
            <TodoWidget />
         </Suspense>
       </div>
    </div>
  );
}