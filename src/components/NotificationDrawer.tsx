'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, X, Check, Share2, MessageSquare } from 'lucide-react';
import { Notification } from '@/types';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  onClickNotification: (notification: Notification) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications');
      if (r.ok) {
        const data: Notification[] = await r.json();
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.isRead).length);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, [load]);

  return { notifications, unreadCount, reload: load };
}

export default function NotificationDrawer({ open, onClose, onClickNotification }: NotificationDrawerProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications');
      if (r.ok) setNotifications(await r.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  async function markRead(id: number) {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-read', notificationId: id }),
    });
    load();
  }

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-all-read' }),
    });
    load();
  }

  function handleClick(n: Notification) {
    if (!n.isRead) markRead(n.id);
    onClickNotification(n);
  }

  if (!open) return null;

  const unread = notifications.filter((n) => !n.isRead);
  const read = notifications.filter((n) => n.isRead);

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,.3)' }} onClick={onClose} />

      {/* Drawer — left side */}
      <div className="fixed top-0 left-0 z-50 h-full flex flex-col"
        style={{
          width: 360,
          maxWidth: '100%',
          background: 'var(--card)',
          borderRight: '1px solid var(--b2)',
          boxShadow: '8px 0 30px rgba(0,0,0,0.2)',
          animation: 'notifSlideIn .2s ease',
        }}>

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between" style={{ padding: '16px 18px', borderBottom: '1px solid var(--b1)' }}>
          <div className="flex items-center gap-2.5">
            <Bell size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <div className="font-display" style={{ fontSize: 20, color: 'var(--txt)' }}>Notifications</div>
              {unread.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
                  {unread.length} unread
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unread.length > 0 && (
              <button className="btn-ghost flex items-center gap-1.5" onClick={markAllRead}>
                <Check size={14} /> Mark all read
              </button>
            )}
            <button className="btn-icon" onClick={onClose} title="Close" aria-label="Close"><X size={16} /></button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '10px 14px' }}>
          {loading ? (
            <div className="text-center py-8" style={{ fontSize: 13, color: 'var(--dim)' }}>Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="empty-state flex flex-col items-center gap-2 py-12" style={{ fontSize: 13, color: 'var(--dim)' }}>
              <Bell size={22} style={{ color: 'var(--muted)' }} />
              No notifications
            </div>
          ) : (
            <>
              {/* Unread */}
              {unread.length > 0 && (
                <>
                  <div className="sec-label mb-2">Unread</div>
                  {unread.map((n) => (
                    <NotifItem key={n.id} notification={n} onClick={() => handleClick(n)} />
                  ))}
                </>
              )}

              {/* Read */}
              {read.length > 0 && (
                <>
                  <div className="sec-label mb-2 mt-4">Earlier</div>
                  {read.map((n) => (
                    <NotifItem key={n.id} notification={n} onClick={() => handleClick(n)} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function NotifItem({ notification: n, onClick }: { notification: Notification; onClick: () => void }) {
  const isShare = n.type === 'share';
  const Icon = isShare ? Share2 : MessageSquare;

  return (
    <div
      className="cursor-pointer group"
      onClick={onClick}
      style={{
        padding: '10px 12px',
        marginBottom: 6,
        borderRadius: 'var(--r-sm)',
        background: n.isRead ? 'transparent' : 'var(--accent-weak)',
        border: `1px solid ${n.isRead ? 'var(--b1)' : 'var(--b2)'}`,
        borderLeft: n.isRead ? '2px solid var(--b1)' : '2px solid var(--accent)',
        transition: 'background .12s',
      }}
      onMouseOver={(e) => (e.currentTarget.style.background = 'var(--card-h)')}
      onMouseOut={(e) => (e.currentTarget.style.background = n.isRead ? 'transparent' : 'var(--accent-weak)')}
    >
      <div className="flex items-start gap-2.5">
        <Icon size={16} style={{ marginTop: 2, flexShrink: 0, color: isShare ? '#60a5fa' : '#a78bfa' }} />
        <div className="flex-1 min-w-0">
          <div style={{
            fontSize: 13,
            color: n.isRead ? 'var(--muted)' : 'var(--txt)',
            fontWeight: n.isRead ? 400 : 600,
            lineHeight: 1.4,
          }}>
            {n.message}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="font-mono tnum" style={{ fontSize: 10, color: 'var(--dim)' }}>
              {timeAgo(n.createdAt)}
            </span>
            <span className="pill" style={{
              fontSize: 10,
              background: isShare ? 'rgba(96,165,250,0.15)' : 'rgba(167,139,250,0.15)',
              color: isShare ? '#60a5fa' : '#a78bfa',
              borderColor: isShare ? 'rgba(96,165,250,0.25)' : 'rgba(167,139,250,0.25)',
            }}>
              {isShare ? 'Share' : 'Comment'}
            </span>
          </div>
        </div>
        {!n.isRead && (
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 4 }} />
        )}
      </div>
    </div>
  );
}
