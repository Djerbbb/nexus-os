import React, { Suspense } from 'react';
import BrainWidget from '@/components/BrainWidget';
import { Loader2 } from 'lucide-react';

export default function BrainPage() {
  return (
    <div className="h-full w-full p-4 md:p-6 flex flex-col">
       <div className="flex-1 h-full relative">
         <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><Loader2 className="animate-spin text-neutral-500"/></div>}>
            <BrainWidget />
         </Suspense>
       </div>
    </div>
  );
}