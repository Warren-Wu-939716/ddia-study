import { useRef, useState } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../lib/db.ts';
import { exportBackup, importBackup, MAX_BACKUP_BYTES, parseBackupText } from '../lib/backup.ts';
import { useSettings } from '../lib/hooks.ts';
import { normalizeSettings, resetAllProgress, saveSettings } from '../lib/repo.ts';

type Message = { kind: 'ok' | 'error'; text: string };

function SchedulingForm({ settings, onSaved }: { settings: Settings; onSaved: (message: Message) => void }) {
  const [newPerDay, setNewPerDay] = useState(String(settings.newCardsPerDay));
  const [retention, setRetention] = useState(String(settings.requestRetention));

  const save = async () => {
    await saveSettings(normalizeSettings({ newCardsPerDay: Number(newPerDay), requestRetention: Number(retention) }));
    onSaved({ kind: 'ok', text: 'Settings saved.' });
  };

  return (
    <section className="card form">
      <h2>Spaced repetition</h2>
      <label>
        New cards per day
        <input type="number" min={0} max={100} value={newPerDay} onChange={(e) => setNewPerDay(e.target.value)} />
        <span className="muted small">Fewer new cards keeps daily reviews manageable. Default {DEFAULT_SETTINGS.newCardsPerDay}.</span>
      </label>
      <label>
        Target retention
        <input type="number" min={0.8} max={0.97} step={0.01} value={retention} onChange={(e) => setRetention(e.target.value)} />
        <span className="muted small">
          Probability of recalling a card when it comes due (FSRS). Higher = more reviews. Default {DEFAULT_SETTINGS.requestRetention}.
        </span>
      </label>
      <button className="primary" onClick={() => void save()}>
        Save settings
      </button>
    </section>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  const [message, setMessage] = useState<Message | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const download = async () => {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ddia-study-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: 'ok', text: 'Backup downloaded.' });
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('Backup file is too large.');
      const backup = parseBackupText(await file.text());
      if (!window.confirm('Replace ALL current progress with this backup?')) return;
      await importBackup(backup);
      setMessage({ kind: 'ok', text: `Restored backup from ${new Date(backup.exportedAt).toLocaleString()}.` });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Import failed.' });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const reset = async () => {
    if (!window.confirm('Delete all progress, reviews, notes and custom cards? This cannot be undone.')) return;
    await resetAllProgress();
    setMessage({ kind: 'ok', text: 'All progress deleted.' });
  };

  return (
    <div className="stack narrow">
      <h1>Settings</h1>
      {message && (
        <p className={message.kind} role="status">
          {message.text}
        </p>
      )}

      {/* Keyed so the form re-initialises once stored settings load or change. */}
      <SchedulingForm key={`${settings.newCardsPerDay}:${settings.requestRetention}`} settings={settings} onSaved={setMessage} />

      <section className="card">
        <h2>Your data</h2>
        <p className="muted small">Everything is stored locally in this browser (IndexedDB). Export regularly — clearing site data deletes it.</p>
        <div className="row gap wrap">
          <button onClick={() => void download()}>Export backup (JSON)</button>
          <label className="button">
            Import backup…
            <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
          <button className="danger" onClick={() => void reset()}>
            Delete all progress
          </button>
        </div>
      </section>
    </div>
  );
}
