import React from 'react';
import DonationCard from './DonationCard';

type Status = 'pending' | 'assigned' | 'picked' | 'in_transit' | 'delivered';

type Donation = {
  id: string;
  foodName: string;
  pickupLocation: string;
  status: Status;
  eta?: string | null;
  assignedAgent?: { name: string } | null;
};

export default function DonorDashboard({ donations }: { donations: Donation[] }) {
  if (!donations || donations.length === 0) {
    return <div className="rounded-lg border border-slate-100 bg-white p-6 text-center text-sm text-slate-600">No active donations</div>;
  }

  return (
    <section>
      <div className="space-y-3">
        {donations.map((d) => (
          <DonationCard key={d.id} donation={d as any} role="donor" />
        ))}
      </div>
    </section>
  );
}
