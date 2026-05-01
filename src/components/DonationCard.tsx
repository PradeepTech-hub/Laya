import React from 'react';
import AgentCard from './AgentCard';

type Status = 'pending' | 'assigned' | 'picked' | 'in_transit' | 'delivered';

type AgentInfo = {
  name?: string;
  phone?: string;
  vehicleNumber?: string;
  profileImageUrl?: string | null;
} | null;

type Donation = {
  id: string;
  foodName: string;
  pickupLocation: string;
  status: Status;
  eta?: string | null;
  assignedAgent?: AgentInfo;
};

const STATUS_META: Record<Status, { label: string; classes: string }> = {
  pending: { label: 'Pending', classes: 'bg-amber-50 text-amber-800' },
  assigned: { label: 'Assigned', classes: 'bg-cyan-50 text-cyan-800' },
  picked: { label: 'Picked Up', classes: 'bg-slate-50 text-slate-800' },
  in_transit: { label: 'In Transit', classes: 'bg-green-50 text-green-800' },
  delivered: { label: 'Delivered', classes: 'bg-emerald-50 text-emerald-800' },
};

export default function DonationCard({
  donation,
  role = 'donor',
}: {
  donation: Donation;
  role?: 'donor' | 'ngo' | 'volunteer';
}) {
  const { foodName, pickupLocation, status, eta, assignedAgent } = donation;

  const showNavigate = role === 'volunteer' && (status === 'pending' || status === 'assigned');

  const openMapsSearch = (q: string) => {
    if (typeof window === 'undefined') return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openMapsDirections = (q: string) => {
    if (typeof window === 'undefined') return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Format agent info for AgentCard
  const agentCardInfo = assignedAgent
    ? {
        name: assignedAgent.name || 'Delivery Agent',
        vehicleNumber: assignedAgent.vehicleNumber || 'N/A',
        profileImageUrl: assignedAgent.profileImageUrl || null,
      }
    : null;

  return (
    <article className="mb-4 rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{foodName}</h3>
          <p className="mt-1 text-sm text-slate-600">Pickup: {pickupLocation}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${STATUS_META[status].classes} border`}>{STATUS_META[status].label}</span>
          {showNavigate ? (
            <button
              onClick={() => openMapsDirections(pickupLocation)}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              Navigate to Pickup
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {role === 'volunteer' ? (
          <div className="flex items-center justify-between">
            <button onClick={() => openMapsSearch(pickupLocation)} className="text-sm text-slate-500 hover:text-slate-700">
              View on map
            </button>

            <span className="text-xs text-slate-400">&nbsp;</span>
          </div>
        ) : (
          <>
            {/* Agent Information Card - For Donor View */}
            {(status === 'assigned' || status === 'picked' || status === 'in_transit') && (
              <div className="mt-3">
                <AgentCard agent={agentCardInfo} status={status} />
              </div>
            )}

            {/* Fallback Info - For Pending Status */}
            {status === 'pending' && !assignedAgent && (
              <div className="space-y-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <p className="text-sm text-slate-600">⏳ Waiting for delivery agent assignment...</p>
              </div>
            )}

            {/* ETA Display */}
            {eta && (
              <div className="rounded-md border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-sm text-emerald-700">
                <p className="text-sm font-medium">✓ ETA: <span className="font-semibold">{eta}</span></p>
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}
