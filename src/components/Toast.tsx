'use client';

import { createContext, useContext, useCallback, useRef, useState } from 'react';

interface ToastContextType {
  toast: (msg: string) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((msg: string) => {
    setMessage(msg);
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 2800);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className={`toast-el ${visible ? 'show' : ''}`}>{message}</div>
    </ToastContext.Provider>
  );
}
