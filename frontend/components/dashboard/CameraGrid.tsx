'use client';

import React from 'react';
import { CameraCard } from './CameraCard';
import { useAppStore } from '../../lib/store';

export const CameraGrid: React.FC = () => {
  const { cameras, activeTab } = useAppStore();

  const filteredCameras =
    activeTab === 'alerts' ? cameras.filter((c) => c.hasAlert) : cameras;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
      {filteredCameras.map((camera) => (
        <CameraCard key={camera.id} camera={camera} />
      ))}
    </div>
  );
};
