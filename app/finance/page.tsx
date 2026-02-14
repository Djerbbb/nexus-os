import React, { Suspense } from 'react';
import FinanceWidget from '@/components/FinanceWidget';
import { Loader2 } from 'lucide-react';

export default function FinancePage() {
  return (
    <div className="h-full w-full p-6 flex flex-col">
      <div className="flex-1 bg-neutral-900/50 border border-white/5 rounded-3xl overflow-hidden p-6 shadow-2xl backdrop-blur-sm relative">
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative z-10 h-full">
          <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><Loader2 className="animate-spin text-neutral-500" /></div>}>
            <FinanceWidget />
          </Suspense>
        </div>
      </div>
    </div>
  );
}