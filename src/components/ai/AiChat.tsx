'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { groupEvents } from './chat-blocks';
import { shouldFollow } from './scroll-pin';
import AiMessage from './AiMessage';
import AiToolTrace from './AiToolTrace';
import type { AiEvent } from './ai-events';
import './ai-chat.css';

export type { AiEvent };

const STATUS_LABEL: Record<string, string> = {
  working: 'working',
  waiting_input: 'waiting for you',
  waiting_approval: 'waiting for your approval',
  idle: 'idle',
};

export default function AiChat({
  events,
  pendingText,
  pendingFailed,
}: {
  events: AiEvent[];
  pendingText?: string | null;
  pendingFailed?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [unread, setUnread] = useState(0);

  const blocks = useMemo(() => groupEvents(events), [events]);

  const toBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setPinned(true);
    setUnread(0);
  }, []);

  // Pinning is measured from the DOM, never from the event array. The split
  // below matters: a scroll event may only ever RE-pin, and only a real
  // gesture may unpin.
  //
  // The obvious version — setPinned(shouldFollow(...)) on every scroll — is
  // wrong, because a programmatic scroll to the bottom fires scroll events at
  // its intermediate positions too. Those look exactly like the reader
  // scrolling away, so the chat unpins itself on its own way down and then
  // silently stops following. Guarding that with a timer only narrows the
  // race; it still discards a real scroll that lands inside the window.
  // Since every programmatic scroll ends at the bottom, "at the bottom → pin"
  // is always safe, and unpinning can be left to wheel and touch, which
  // nothing but a human fires.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;

    const atBottom = () => shouldFollow(el.scrollTop, el.scrollHeight, el.clientHeight);

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (atBottom()) { setPinned(true); setUnread(0); }
      });
    };
    // Wheeling up is an intent to leave the tail even before the scroll lands.
    // If it turns out we were already at the bottom, the scroll handler above
    // re-pins on the same gesture, so a rubber-band at the bottom is a no-op.
    const onWheel = (e: WheelEvent) => { if (e.deltaY < 0) setPinned(false); };
    const onTouchMove = () => { if (!atBottom()) setPinned(false); };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', onTouchMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (pinned) toBottom('auto');
    else setUnread((n) => n + 1);
    // Keyed on length: a re-render with no new events must not move the reader.
  }, [events.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sending is an intent to watch the bottom.
  useEffect(() => {
    if (pendingText) toBottom('auto');
  }, [pendingText, toBottom]);

  // data-pinned is a debugging affordance: whether the chat is following the
  // tail is otherwise invisible until a message arrives, which makes a scroll
  // bug tedious to reproduce. It costs one attribute.
  return (
    <div className="aic-scroll" ref={scrollRef} data-pinned={pinned ? '1' : '0'}>
      <div className="aic-stack">
        {blocks.map((b) => {
          if (b.kind === 'user') return <div key={b.key} className="aic-user">{b.text}</div>;
          if (b.kind === 'assistant') return <AiMessage key={b.key} text={b.text} />;
          if (b.kind === 'tools') return <AiToolTrace key={b.key} items={b.items} />;
          if (b.kind === 'thinking') {
            return (
              <details key={b.key} className="aic-think">
                <summary>thought for a moment</summary>
                <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{b.text}</div>
              </details>
            );
          }
          return (
            <div key={b.key} className="aic-status">
              {STATUS_LABEL[b.status] || b.status}
            </div>
          );
        })}

        {pendingText && (
          <div className="aic-user aic-pending">
            {pendingText}
            {pendingFailed && <div className="aic-failed">not delivered — tap send to retry</div>}
          </div>
        )}

        {!pinned && unread > 0 && (
          <button className="aic-pill" onClick={() => toBottom('smooth')}>
            ↓ {unread} new message{unread === 1 ? '' : 's'}
          </button>
        )}
      </div>
    </div>
  );
}
