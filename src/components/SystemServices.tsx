'use client';

import { useState } from 'react';
import { SystemService } from '@/types';
import { useToast } from './Toast';
import { Server, Plus, Trash2 } from 'lucide-react';

interface SystemServicesProps {
  services: SystemService[];
  onReload: () => void;
}

export default function SystemServices({ services, onReload }: SystemServicesProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [port, setPort] = useState('');
  const [desc, setDesc] = useState('');
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!name.trim() || !port.trim()) { toast('Name and port are required'); return; }
    setAdding(true);
    try {
      const r = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), port: parseInt(port), description: desc.trim() }),
      });
      if (!r.ok) throw new Error();
      setName(''); setPort(''); setDesc('');
      toast('Service added');
      onReload();
    } catch {
      toast('Failed to add service');
    }
    setAdding(false);
  }

  async function handleDelete(id: number, svcName: string) {
    try {
      await fetch(`/api/services/${id}`, { method: 'DELETE' });
      toast(`${svcName} removed`);
      onReload();
    } catch {
      toast('Failed to remove service');
    }
  }

  return (
    <div className="mt-6">
      <div className="sec-label flex items-center gap-2">
        <Server size={15} style={{ color: 'var(--muted)' }} />
        <span>System Services</span>
        <span className="sec-count">{services.length}</span>
      </div>

      {/* Add form */}
      <div className="card-v2 flex items-end gap-2 flex-wrap mb-4" style={{ padding: '14px 16px' }}>
        <div>
          <div className="label mb-1">Service Name *</div>
          <input type="text" placeholder="PostgreSQL" value={name} onChange={(e) => setName(e.target.value)}
            className="inp" style={{ width: 160 }} />
        </div>
        <div>
          <div className="label mb-1">Port *</div>
          <input type="number" placeholder="5432" value={port} onChange={(e) => setPort(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="inp font-mono tnum" style={{ width: 90 }} />
        </div>
        <div className="flex-1" style={{ minWidth: 140 }}>
          <div className="label mb-1">Description</div>
          <input type="text" placeholder="Database server" value={desc} onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="inp" />
        </div>
        <button className="btn-grad flex items-center gap-1.5" onClick={handleAdd} disabled={adding}>
          <Plus size={15} /> Add
        </button>
      </div>

      {/* Services list */}
      {services.length === 0 ? (
        <div className="empty-state">
          No system services assigned — add ports like MySQL, PostgreSQL, Redis
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {/* Header row */}
          <div className="flex items-center gap-3 px-3 py-1.5">
            <div className="label" style={{ width: 70 }}>Port</div>
            <div className="label" style={{ width: 150 }}>Service</div>
            <div className="label flex-1">Description</div>
            <div style={{ width: 36 }} />
          </div>
          {services.map((s) => (
            <div key={s.id} className="card-v2 flex items-center gap-3 group" style={{ padding: '10px 12px' }}>
              <div className="font-mono tnum" style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', width: 70 }}>
                :{s.port}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--txt)', fontWeight: 600, width: 150 }}>
                {s.name}
              </div>
              <div className="flex-1" style={{ fontSize: 13, color: 'var(--muted)' }}>
                {s.description}
              </div>
              <button className="btn-icon danger opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleDelete(s.id, s.name)}
                title="Remove" aria-label="Remove service">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
