'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShareComment } from '@/types';
import { useToast } from './Toast';
import { Send, Trash2, MessageSquare } from 'lucide-react';

interface DrawerCommentsProps {
  projectId: number;
  currentUserId: number;
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

export default function DrawerComments({ projectId, currentUserId }: DrawerCommentsProps) {
  const { toast } = useToast();
  const [comments, setComments] = useState<ShareComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);

  const loadComments = useCallback(async () => {
    try {
      const r = await fetch(`/api/comments?projectId=${projectId}`);
      if (r.ok) setComments(await r.json());
    } catch { /* silent */ }
  }, [projectId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  async function addComment() {
    if (!newComment.trim()) return;
    setLoading(true);
    try {
      const r = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, content: newComment.trim() }),
      });
      if (r.ok) {
        setNewComment('');
        loadComments();
      }
    } catch {
      toast('Failed to add comment');
    }
    setLoading(false);
  }

  async function deleteComment(commentId: number) {
    try {
      await fetch('/api/comments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId }),
      });
      loadComments();
    } catch {
      toast('Failed to delete comment');
    }
  }

  return (
    <div>
      {/* Add comment */}
      <div className="mb-4" style={{ background: 'var(--inp-bg)', border: '1px solid var(--b2)', borderRadius: 'var(--r)' }}>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment..."
          className="w-full bg-transparent outline-none resize-none px-3 py-2.5"
          style={{ fontSize: 13, color: 'var(--txt)', minHeight: 64, maxHeight: 150, lineHeight: 1.6 }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment(); }}
        />
        <div className="flex items-center justify-between px-3 py-2" style={{ borderTop: '1px solid var(--b1)' }}>
          <span style={{ fontSize: 12, color: 'var(--dim)' }}>&#8984;+Enter to send</span>
          <button className="btn-grad inline-flex items-center gap-1.5" onClick={addComment} disabled={loading || !newComment.trim()}>
            <Send size={14} />
            {loading ? 'Sending...' : 'Comment'}
          </button>
        </div>
      </div>

      {/* Comments list */}
      {comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10" style={{ color: 'var(--dim)' }}>
          <MessageSquare size={20} />
          <span style={{ fontSize: 13 }}>No comments yet</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {comments.map((c) => {
            const isMine = c.userId === currentUserId;
            return (
              <div key={c.id} className="group"
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--r)',
                  background: isMine ? 'var(--inp-bg)' : 'var(--card)',
                  border: '1px solid var(--b1)',
                  borderLeft: isMine ? '2px solid var(--accent)' : '2px solid var(--b2)',
                }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-display" style={{ fontSize: 13, fontWeight: 700, color: isMine ? 'var(--accent)' : 'var(--txt)' }}>
                      {c.userName || 'Unknown'}
                    </span>
                    {isMine && (
                      <span className="pill" style={{ fontSize: 11 }}>You</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tnum" style={{ fontSize: 11, color: 'var(--dim)' }}>{timeAgo(c.createdAt)}</span>
                    {isMine && (
                      <button className="btn-icon danger opacity-0 group-hover:opacity-100"
                        onClick={() => deleteComment(c.id)}
                        title="Delete comment" aria-label="Delete comment">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--txt)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {c.content}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
