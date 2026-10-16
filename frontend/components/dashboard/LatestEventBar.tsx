'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const LatestEventBar: React.FC = () => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 pb-1 border-t border-gray-100 text-xs">
      {/* Event description */}
      <div className="flex items-center gap-2">
        <span className="font-bold text-slate-800 tracking-wider">LATEST EVENT:</span>
        <span className="font-bold text-[#dc2626]">
          14:23 — Cam 2: Fall detected at Kiosk
        </span>
      </div>

      {/* Navigation link to Incident Log */}
      <Link
        href="/incidents"
        className="flex items-center gap-1 font-bold text-[#0369a1] hover:text-[#0284c7] transition hover:underline"
      >
        <span>Incident Log</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
};
