'use client';

import { useState } from 'react';
import { useToast } from './Toast';
import { Project } from '@/types';
import { X, Radar, ScanLine, ExternalLink, Plus, Check, Server, Plug } from 'lucide-react';

interface PortScannerProps {
  visible: boolean;
  projects: Project[];
  onQuickAdd: (port: number) => void;
}

function DaemonSetupGuide({ onClose }: { onClose: () => void }) {
  const steps = [
    {
      n: 1,
      title: 'Install Globally',
      body: <pre className="font-mono" style={{ background: 'var(--card)', borderRadius: 'var(--r-sm)', padding: '12px 16px', fontSize: 13, color: 'var(--txt)', overflow: 'auto', margin: 0, border: '1px solid var(--b1)', lineHeight: 1.7 }}>
{`$ npm install -g @indianic/dialout`}
      </pre>,
    },
    {
      n: 2,
      title: 'Configure & Connect',
      body: <>
        <pre className="font-mono" style={{ background: 'var(--card)', borderRadius: 'var(--r-sm)', padding: '12px 16px', fontSize: 13, color: 'var(--txt)', overflow: 'auto', margin: 0, border: '1px solid var(--b1)', lineHeight: 1.7 }}>
{`$ dialout init
  Server URL: wss://www.dialout.dev
  API Key:    mch_xxxxxxxxxxxxxxxx`}
        </pre>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10 }}>
          Get your API key from{' '}
          <strong style={{ color: 'var(--accent)' }}>Settings &rarr; Machines &rarr; Add Machine</strong>
        </p>
      </>,
    },
    {
      n: 3,
      title: 'Start the Agent',
      body: <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div className="glass" style={{ flex: 1, minWidth: 160, borderRadius: 'var(--r-sm)', padding: '12px 16px' }}>
          <div className="label" style={{ marginBottom: 6 }}>Foreground</div>
          <code className="font-mono" style={{ fontSize: 13, color: 'var(--txt)' }}>$ dialout start</code>
        </div>
        <div className="glass" style={{ flex: 1, minWidth: 160, borderRadius: 'var(--r-sm)', padding: '12px 16px' }}>
          <div className="label" style={{ marginBottom: 6 }}>As Service</div>
          <code className="font-mono" style={{ fontSize: 13, color: 'var(--txt)' }}>$ dialout install-service</code>
        </div>
      </div>,
    },
  ];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580, maxHeight: '88vh', overflowY: 'auto' }}>
        <button onClick={onClose} className="btn-icon" title="Close" aria-label="Close"
          style={{ position: 'absolute', top: 16, right: 16 }}>
          <X size={16} />
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <Server size={14} /> Agent Setup Required
          </div>
          <h2 className="font-display grad-text" style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            Connect Your Machine
          </h2>
          <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6 }}>
            Install the Dialout Agent to scan ports, preview projects,
            and open remote terminals from anywhere.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {steps.map((step) => (
            <div key={step.n} className="card-v2" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span className="font-display" style={{ background: 'var(--grad)', color: '#fff', width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{step.n}</span>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--txt)' }}>{step.title}</span>
              </div>
              {step.body}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button onClick={onClose} className="btn-grad" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Check size={16} /> Got It
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PortScanner({ visible, projects, onQuickAdd }: PortScannerProps) {
  const { toast } = useToast();
  const [from, setFrom] = useState(3000);
  const [to, setTo] = useState(9999);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [scanResults, setScanResults] = useState<number[] | null>(null);
  const [scanMeta, setScanMeta] = useState({ from: 0, to: 0, scanned: 0 });
  const [singlePort, setSinglePort] = useState('');
  const [singleResult, setSingleResult] = useState<string>('');
  const [singleColor, setSingleColor] = useState('var(--dim)');
  const [showSetup, setShowSetup] = useState(false);

  if (!visible) return null;

  const existingPorts = new Set<number>();
  projects.forEach((p) => {
    if (p.port) existingPorts.add(p.port);
    (p.addonPorts || '').split(',').map((x) => parseInt(x.trim())).filter((n) => !isNaN(n) && n > 0)
      .forEach((n) => existingPorts.add(n));
  });

  async function doScan() {
    if (isNaN(from) || isNaN(to)) { toast('Enter valid range'); return; }

    setScanning(true);
    setScanMsg(`Scanning ${Math.abs(to - from) + 1} ports...`);

    try {
      const r = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      });
      const d = await r.json();
      if (d.error === 'daemon_offline') {
        setShowSetup(true);
        setScanning(false);
        return;
      }
      setScanResults(d.ports);
      setScanMeta({ from, to, scanned: d.scanned });
    } catch {
      toast('Scan failed - is the server running?');
    }
    setScanning(false);
  }

  async function checkOne() {
    const port = parseInt(singlePort);
    if (isNaN(port)) return;
    setSingleResult('...'); setSingleColor('var(--dim)');
    try {
      const r = await fetch(`/api/check/${port}`);
      const d = await r.json();
      if (d.error === 'daemon_offline') {
        setShowSetup(true);
        return;
      }
      setSingleResult(d.running ? '\u25CF OPEN' : '\u25CB CLOSED');
      setSingleColor(d.running ? 'var(--accent)' : 'var(--b3)');
    } catch {
      setSingleResult('ERR');
    }
  }

  return (
    <div style={{ borderBottom: '1px solid var(--b1)' }}>
      <div className="max-w-screen-xl mx-auto px-4 sm:px-5 py-5">
        <div className="card-v2" style={{ padding: '18px 20px' }}>
          <div className="flex items-start gap-4 sm:gap-8 flex-wrap">
            {/* Range scanner */}
            <div>
              <div className="label flex items-center gap-1.5 mb-3" style={{ color: 'var(--muted)' }}>
                <Radar size={15} /> Port Range Scanner
              </div>
              <div className="flex items-end gap-2 flex-wrap">
                <div>
                  <div className="label mb-1">From</div>
                  <input type="number" value={from} onChange={(e) => setFrom(parseInt(e.target.value) || 0)}
                    className="inp font-mono tnum" style={{ width: 90 }} />
                </div>
                <div className="pb-2.5" style={{ color: 'var(--dim)', fontSize: 14 }}>&mdash;</div>
                <div>
                  <div className="label mb-1">To</div>
                  <input type="number" value={to} onChange={(e) => setTo(parseInt(e.target.value) || 0)}
                    className="inp font-mono tnum" style={{ width: 90 }} />
                </div>
                <button className="btn-grad flex items-center gap-1.5" onClick={doScan} disabled={scanning}>
                  {scanning ? <span className="spin" style={{ width: 14, height: 14, display: 'inline-block' }} /> : <ScanLine size={15} />}
                  {scanning ? 'Scanning…' : 'Scan'}
                </button>
                {scanning && (
                  <div className="flex flex-col justify-center ml-1" style={{ gap: 5 }}>
                    <div className="scan-track"><div className="scan-fill" /></div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{scanMsg}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Single port */}
            <div className="sm:border-l sm:pl-7 pt-4 sm:pt-0" style={{ borderColor: 'var(--b1)' }}>
              <div className="label flex items-center gap-1.5 mb-3" style={{ color: 'var(--muted)' }}>
                <Plug size={15} /> Single Port Check
              </div>
              <div className="flex items-end gap-2">
                <div>
                  <div className="label mb-1">Port</div>
                  <input type="number" placeholder="8080" value={singlePort}
                    onChange={(e) => setSinglePort(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && checkOne()}
                    className="inp font-mono tnum" style={{ width: 100 }} />
                </div>
                <button className="btn-ghost flex items-center gap-1.5" onClick={checkOne}>
                  <Check size={15} /> Check
                </button>
                <div className="font-mono" style={{ fontSize: 13, color: singleColor, paddingBottom: 9 }}>{singleResult}</div>
              </div>
            </div>
          </div>

          {/* Scan results */}
          {scanResults !== null && (
            <div style={{ borderTop: '1px solid var(--b1)', marginTop: 18, paddingTop: 16 }}>
              <div className="flex items-center justify-between mb-3">
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  Found <span className="font-mono tnum" style={{ color: 'var(--txt)', fontWeight: 700 }}>{scanResults.length}</span> open ports in{' '}
                  <span className="font-mono tnum">{scanMeta.from}&ndash;{scanMeta.to}</span>{' '}
                  (<span className="font-mono tnum">{scanMeta.scanned}</span> checked)
                </div>
                <button className="btn-icon" title="Close results" aria-label="Close results"
                  onClick={() => setScanResults(null)}>
                  <X size={15} />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {scanResults.length === 0 ? (
                  <div className="empty-state" style={{ width: '100%' }}>No open ports found</div>
                ) : (
                  scanResults.map((port) => (
                    <div key={port} className="glass flex items-center gap-3" style={{ borderRadius: 'var(--r-sm)', padding: '8px 12px' }}>
                      <div className="flex items-center gap-2">
                        <div className="live-dot" />
                        <span className="font-mono tnum" style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 700 }}>:{port}</span>
                        <a href={`http://localhost:${port}`} target="_blank" rel="noreferrer"
                          className="font-mono flex items-center gap-1" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                          localhost:{port} <ExternalLink size={11} />
                        </a>
                      </div>
                      {existingPorts.has(port) ? (
                        <span className="status-chip static">In Dash</span>
                      ) : (
                        <button className="btn-solid btn-green flex items-center gap-1" onClick={() => onQuickAdd(port)}
                          style={{ fontSize: 12, padding: '4px 10px' }}>
                          <Plus size={13} /> Add
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {showSetup && <DaemonSetupGuide onClose={() => setShowSetup(false)} />}
    </div>
  );
}
