'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, X, Save } from 'lucide-react';
import { Project, ProjectFormData } from '@/types';
import FsBrowserModal from './FsBrowserModal';

interface ProjectModalProps {
  open: boolean;
  editingProject: Project | null;
  machineId?: number;
  initialData?: Partial<ProjectFormData>;
  onClose: () => void;
  onSave: (data: ProjectFormData, id?: number) => void;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

export default function ProjectModal({ open, editingProject, machineId, initialData, onClose, onSave }: ProjectModalProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [rootPath, setRootPath] = useState('');

  useEffect(() => {
    if (open) {
      setTimeout(() => nameRef.current?.focus(), 80);
      setRootPath(editingProject?.rootPath || initialData?.rootPath || '');
    }
  }, [open, editingProject, initialData]);

  if (!open) return null;

  const isEdit = !!editingProject;
  const init = (editingProject ?? initialData ?? {}) as Partial<ProjectFormData>;

  function handlePortChange(portVal: string, urlInput: HTMLInputElement) {
    if (!urlInput.value || /^http:\/\/localhost:\d*$/.test(urlInput.value)) {
      urlInput.value = portVal ? `http://localhost:${portVal}` : '';
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const form = formRef.current!;
    const fd = new FormData(form);

    const data: ProjectFormData = {
      name: (fd.get('name') as string).trim(),
      port: parseInt(fd.get('port') as string) || null,
      addonPorts: (fd.get('addonPorts') as string).trim(),
      url: (fd.get('url') as string).trim(),
      techStack: (fd.get('techStack') as string).trim(),
      description: (fd.get('description') as string).trim(),
      startDate: (fd.get('startDate') as string) || today(),
      runner: fd.get('runner') as string,
      status: fd.get('status') as string,
      tags: (fd.get('tags') as string).trim(),
      notes: (fd.get('notes') as string).trim(),
      rootPath: (fd.get('rootPath') as string).trim(),
      startCommand: (fd.get('startCommand') as string || '').trim(),
      stopCommand: (fd.get('stopCommand') as string || '').trim(),
      restartCommand: (fd.get('restartCommand') as string || '').trim(),
      runInBackground: fd.get('runInBackground') === 'on',
    };

    onSave(data, editingProject?.id);
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box mx-3">
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: '18px 22px', borderBottom: '1px solid var(--b1)' }}>
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center rounded-lg" style={{ width: 34, height: 34, background: 'var(--grad-soft)', border: '1px solid var(--glass-border)', color: 'var(--accent)' }}>
              {isEdit ? <Pencil size={17} /> : <Plus size={18} />}
            </span>
            <h2 className="font-display" style={{ fontSize: 20, color: 'var(--txt)' }}>{isEdit ? 'Edit project' : 'New project'}</h2>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>

        {/* Form */}
        <form ref={formRef} onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3.5" style={{ padding: '20px 22px' }}>
            {/* Name + Port */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="label">PROJECT NAME *</label>
                <input ref={nameRef} name="name" type="text" placeholder="My Awesome App" className="inp"
                  defaultValue={init.name || ''} required />
              </div>
              <div>
                <label className="label">PORT</label>
                <input name="port" type="number" placeholder="3000" className="inp"
                  defaultValue={init.port || ''}
                  onChange={(e) => {
                    const urlEl = formRef.current?.querySelector('[name="url"]') as HTMLInputElement;
                    if (urlEl) handlePortChange(e.target.value, urlEl);
                  }} />
              </div>
            </div>

            {/* Addon Ports */}
            <div>
              <label className="label">
                ADDON PORTS <span style={{ color: 'var(--b3)' }}>(comma separated, e.g. 3001, 5173, 9229)</span>
              </label>
              <input name="addonPorts" type="text" placeholder="3001, 5173, 9229" className="inp"
                defaultValue={init.addonPorts || ''} />
            </div>

            {/* URL */}
            <div>
              <label className="label">
                URL <span style={{ color: 'var(--b3)' }}>(auto-filled from port)</span>
              </label>
              <input name="url" type="text" placeholder="http://localhost:3000" className="inp"
                defaultValue={init.url || ''} />
            </div>

            {/* Runner + Status + Date */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">RUNNER</label>
                <select name="runner" className="inp" defaultValue={init.runner || 'npm'}>
                  <option value="npm">npm run dev</option>
                  <option value="pm2">PM2</option>
                  <option value="yarn">yarn dev</option>
                  <option value="php">PHP</option>
                  <option value="docker">Docker</option>
                  <option value="python">Python</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="label">STATUS</label>
                <select name="status" className="inp" defaultValue={init.status || 'active'}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <label className="label">START DATE</label>
                <input name="startDate" type="date" className="inp"
                  defaultValue={init.startDate || today()} />
              </div>
            </div>

            {/* Tech stack */}
            <div>
              <label className="label">
                TECH STACK <span style={{ color: 'var(--b3)' }}>(comma separated)</span>
              </label>
              <input name="techStack" type="text" placeholder="React, Node.js, PostgreSQL, Tailwind" className="inp"
                defaultValue={init.techStack || ''} />
            </div>

            {/* Tags */}
            <div>
              <label className="label">
                TAGS <span style={{ color: 'var(--b3)' }}>(comma separated)</span>
              </label>
              <input name="tags" type="text" placeholder="client, saas, internal, freelance" className="inp"
                defaultValue={init.tags || ''} />
            </div>

            {/* Description */}
            <div>
              <label className="label">DESCRIPTION / SUMMARY</label>
              <textarea name="description" rows={2} placeholder="What does this project do? Who is it for?" className="inp"
                style={{ resize: 'vertical' }} defaultValue={init.description || ''} />
            </div>

            {/* Notes */}
            <div>
              <label className="label">NOTES</label>
              <textarea name="notes" rows={2} placeholder="Anything worth remembering about this project" className="inp"
                style={{ resize: 'vertical' }} defaultValue={init.notes || ''} />
            </div>

            {/* Process control */}
            <div>
              <label className="label">START COMMAND</label>
              <input name="startCommand" type="text" placeholder="npm run dev  ·  pm2 start ecosystem.config.js"
                className="inp" defaultValue={init.startCommand || ''} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">STOP COMMAND</label>
                <input name="stopCommand" type="text" placeholder="pm2 stop app" className="inp" defaultValue={init.stopCommand || ''} />
              </div>
              <div>
                <label className="label">RESTART COMMAND</label>
                <input name="restartCommand" type="text" placeholder="pm2 restart app" className="inp" defaultValue={init.restartCommand || ''} />
              </div>
            </div>
            <label className="flex items-center gap-2 mt-1" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              <input name="runInBackground" type="checkbox" defaultChecked={init.runInBackground ?? true} />
              Run start command in the background
            </label>

            <div>
              <label className="label">
                PROJECT ROOT PATH <span style={{ color: 'var(--b3)' }}>(for terminal sessions)</span>
              </label>
              <div className="flex items-center gap-2">
                <input name="rootPath" type="text" placeholder="/Users/you/projects/my-app" className="inp flex-1"
                  value={rootPath} onChange={(e) => setRootPath(e.target.value)} />
                {machineId && (
                  <button type="button" onClick={() => setBrowseOpen(true)}
                    className="font-mono shrink-0 px-2 py-1.5 rounded"
                    style={{ fontSize: 9, background: 'var(--b1)', color: 'var(--accent)', border: '1px solid var(--b2)', cursor: 'pointer' }}>
                    BROWSE
                  </button>
                )}
              </div>
            </div>

            {machineId && (
              <FsBrowserModal
                open={browseOpen}
                machineId={machineId}
                currentPath={rootPath || '/'}
                onSelect={(p) => setRootPath(p)}
                onClose={() => setBrowseOpen(false)}
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 glass-strong" style={{ padding: '14px 22px', borderTop: '1px solid var(--b1)', position: 'sticky', bottom: 0 }}>
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-grad"><Save size={16} /> {isEdit ? 'Save changes' : 'Create project'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
