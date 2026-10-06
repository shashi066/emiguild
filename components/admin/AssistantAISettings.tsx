'use client';

import { useEffect, useState } from 'react';
import { AdminModalShell } from './AdminModalShell';
import { Bot, Edit2, KeyRound, Save, X } from 'lucide-react';

type Config = { model: string; dailyLimit: number; keyConfigured: boolean };

export function AssistantAISettings({ hidden = false }: { hidden?: boolean }) {
  const [config, setConfig] = useState<Config>({ model: 'gpt-6-luna', dailyLimit: 10, keyConfigured: false });
  const [draft, setDraft] = useState(config);
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/admin/assistant-config', { cache: 'no-store', signal: abort.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Could not load AI settings.');
        setConfig(data);
      })
      .catch((failure) => { if (!abort.signal.aborted) setError(failure.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, []);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/assistant-config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: draft.model, dailyLimit: draft.dailyLimit, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), clearApiKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not save AI settings.');
      setConfig(data); setApiKey(''); setClearApiKey(false);
      setNotice('AI settings saved. Changes apply to new requests.');
      setEditing(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save AI settings.');
    } finally { setSaving(false); }
  };

  return <>
    <div hidden={hidden} className="card admin-setting-card admin-ai-setting-card">
      <span className="admin-setting-icon"><Bot size={20} /></span>
      <div className="admin-setting-copy">
        <strong>Emiily AI Configuration</strong>
        <span>API credentials, model, and signed-in daily allowance.</span>
        <div className="admin-setting-pills">
          <span>{loading ? 'Loading…' : config.model}</span><span>{config.dailyLimit}/day</span>
          <span className={config.keyConfigured ? 'is-success' : 'is-warning'}>{config.keyConfigured ? 'Key saved' : 'Key required'}</span>
        </div>
        {notice && <span className="admin-setting-notice" role="status">{notice}</span>}
        {!editing && error && <span className="form-error" role="alert">{error}</span>}
      </div>
      <button className="btn btn-ghost btn-sm" type="button" disabled={loading} onClick={() => { setDraft(config); setApiKey(''); setClearApiKey(false); setError(''); setNotice(''); setEditing(true); }}><Edit2 size={14} /> Edit</button>
    </div>

    {editing && <AdminModalShell labelledBy="assistant-ai-title" onClose={() => { if (!saving) setEditing(false); }} lightweight>
      <form onSubmit={save}>
        <div className="admin-settings-modal-head">
          <div><span className="admin-setting-icon"><KeyRound size={19} /></span><div><h2 id="assistant-ai-title">Emiily AI Configuration</h2><p>Public EmiGuild help only; guided buttons use a separate allowance.</p></div></div>
          <button className="btn btn-ghost btn-sm" type="button" aria-label="Close" disabled={saving} onClick={() => setEditing(false)}><X size={18} /></button>
        </div>
        <div className="admin-settings-form-grid">
          <div className="form-group admin-settings-form-wide">
            <label className="form-label" htmlFor="assistant-ai-key">OpenAI API key</label>
            <input id="assistant-ai-key" className="form-input" type="password" autoComplete="new-password" spellCheck={false} maxLength={512} value={apiKey} disabled={saving || clearApiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={config.keyConfigured ? 'Key saved — leave blank to keep it' : 'sk-…'} />
            <small>{config.keyConfigured ? 'A key is saved and is never displayed.' : 'No key is saved, so AI chat is unavailable.'} Keys are encrypted at rest.</small>
            {config.keyConfigured && <label className="admin-settings-checkbox"><input type="checkbox" checked={clearApiKey} disabled={saving} onChange={(e) => { setClearApiKey(e.target.checked); setApiKey(''); }} /> Remove saved key and disable AI chat</label>}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="assistant-ai-model">Model ID</label>
            <input id="assistant-ai-model" className="form-input" required maxLength={100} value={draft.model} disabled={saving} onChange={(e) => setDraft((current) => ({ ...current, model: e.target.value }))} />
            <small>Must support Responses and structured output.</small>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="assistant-ai-limit">Requests per account per day</label>
            <input id="assistant-ai-limit" className="form-input" type="number" required min={1} max={1000} step={1} value={Number.isNaN(draft.dailyLimit) ? '' : draft.dailyLimit} disabled={saving} onChange={(e) => setDraft((current) => ({ ...current, dailyLimit: e.target.valueAsNumber }))} />
            <small>Resets at midnight IST and applies equally to customers and admins.</small>
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="admin-settings-modal-actions"><button className="btn btn-ghost" type="button" disabled={saving} onClick={() => setEditing(false)}>Cancel</button><button className="btn btn-primary" type="submit" disabled={saving}><Save size={15} />{saving ? 'Saving…' : 'Save AI settings'}</button></div>
      </form>
    </AdminModalShell>}
  </>;
}
