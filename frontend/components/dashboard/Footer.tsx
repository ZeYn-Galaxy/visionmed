'use client';

import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-4 bg-white rounded-xl py-3 px-6 shadow-2xs border border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="text-gray-500 font-medium">
        © 2025 VisionMed Clinical Systems
      </span>

      <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
        <span>System Operational</span>
      </div>
    </footer>
  );
};
