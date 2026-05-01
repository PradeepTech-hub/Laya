import React from 'react';
import { Truck, MapPin } from 'lucide-react';

type AgentInfo = {
  name: string;
  vehicleNumber: string;
  profileImageUrl?: string | null;
};

export default function AgentCard({ agent, status }: { agent: AgentInfo | null; status: string }) {
  if (!agent) {
    return (
      <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
        <p className="text-sm font-medium text-amber-700">🔍 Agent not assigned yet</p>
      </div>
    );
  }

  const defaultAvatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(agent.name)}`;
  const imageUrl = agent.profileImageUrl || defaultAvatarUrl;

  return (
    <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50/50 to-blue-50/50 p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Truck size={16} className="text-cyan-600" />
            Delivery Agent
          </h3>
          <p className="text-xs text-slate-500 mt-1">Real-time tracking enabled</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
          status === 'in_transit' 
            ? 'bg-green-100 text-green-800' 
            : status === 'picked'
            ? 'bg-blue-100 text-blue-800'
            : 'bg-slate-100 text-slate-800'
        }`}>
          {status === 'in_transit' ? '🚗 En Route' : status === 'picked' ? '✓ Picked' : 'Assigned'}
        </span>
      </div>

      {/* Agent Details */}
      <div className="grid grid-cols-[auto_1fr] gap-4">
        {/* Profile Picture */}
        <div className="flex-shrink-0">
          <img
            src={imageUrl}
            alt={agent.name}
            className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md"
          />
        </div>

        {/* Name & Vehicle */}
        <div className="flex flex-col justify-center space-y-2">
          <div>
            <p className="text-sm font-bold text-slate-900">{agent.name}</p>
            <p className="text-xs text-slate-600">Delivery Volunteer</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <MapPin size={14} className="text-cyan-600 flex-shrink-0" />
            <span className="font-mono font-semibold text-slate-700 bg-white/60 px-2.5 py-1 rounded-lg border border-cyan-100">
              {agent.vehicleNumber}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-4 pt-4 border-t border-cyan-100 flex items-center justify-between text-xs text-slate-600">
        <span>✓ Background verified</span>
        <span>📍 GPS Enabled</span>
      </div>
    </div>
  );
}
