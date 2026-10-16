'use client';

import React from 'react';
import { useAppStore } from '../../lib/store';

export const FilterTabBar: React.FC = () => {
  const { activeTab, setActiveTab, cameras } = useAppStore();
  const alertCount = cameras.filter((c) => c.hasAlert).length;

  return (
    <div className="flex items-center gap-2 mb-4">
      {/* All Feeds Tab */}
      <button
        onClick={() => setActiveTab('all')}
        className={`text-xs font-bold px-4 py-1.5 rounded-md transition shadow-2xs ${
          activeTab === 'all'
            ? 'bg-[#0369a1] text-white'
            : 'bg-white border border-[#0369a1] text-[#0369a1] hover:bg-sky-50'
        }`}
      >
        All Feeds
      </button>

      {/* Alerts Tab */}
      <button
        onClick={() => setActiveTab('alerts')}
        className={`text-xs font-bold px-4 py-1.5 rounded-md transition shadow-2xs ${
          activeTab === 'alerts'
            ? 'bg-[#b91c1c] text-white'
            : 'bg-white border border-[#b91c1c] text-[#b91c1c] hover:bg-red-50'
        }`}
      >
        Alerts ({alertCount})
      </button>
    </div>
  );
};
