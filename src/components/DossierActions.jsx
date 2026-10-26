import { useState } from 'react';
import { Bookmark, Check, Download, Link2, Printer, Share2 } from 'lucide-react';
import { useSaved } from '../hooks/useSaved';

/** Native bridge injected by the Android app (null in a plain browser). */
const bridge = () => (typeof window === 'undefined' ? null : window.AndroidBridge || null);

const safeFileName = (title) =>
  String(title || 'dossier').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'dossier';

/** UTF-8 safe base64 (btoa throws on characters outside Latin-1). */
const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

/** Builds a readable Markdown version of a dossier for export or sharing. */
export function dossierToMarkdown(view) {
  const lines = [`# ${view.title}`, ''];
  if (view.meta) lines.push(`_${view.meta}_`, '');
  if (view.summary) lines.push(view.summary, '');

  const infoboxRows = Object.entries(view.info || {}).filter(([, value]) => value);
  if (infoboxRows.length) {
    lines.push('## Инфобокс', '');
    for (const [key, value] of infoboxRows) lines.push(`- **${key}**: ${value}`);
    lines.push('');
  }

  const section = (title, items, map) => {
    if (!items?.length) return;
    lines.push(`## ${title}`, '');
    for (const item of items) lines.push(`- ${map(item)}`);
    lines.push('');
  };

  section('Причины', view.causes, (item) => `${item.kind}: ${item.text}`);
  section('Последствия', view.outcomes, (item) => `${item.kind}: ${item.text}`);
  section('Хронология', view.timeline, (item) => `${item.date} — ${item.title}: ${item.text}`);
  section('Что известно точно', view.knownFacts, (item) => item.text || item.claim || item);
  section('Что спорно', view.disputedClaims, (item) => item.text || item.claim || item);
  section('Мифы и упрощения', view.myths, (item) => `${item.claim || item.text} — ${item.explanation || ''}`);
  section('Позиции сторон', view.perspectives, (item) => `${item.side}: ${item.thesis}`);
  section('Источники', view.sources, (item) => `[${item.title}](${item.url}) — ${item.type || ''} (${item.reliability || 'требует оценки'})`);

  if (view.researchPipeline?.length) {
    lines.push('## Что изучить дальше', '');
    view.researchPipeline.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
    lines.push('');
  }
  lines.push('— Экспорт из WorldHistory Atlas');
  return lines.join('\n');
}

export default function DossierActions({ view, dossierId }) {
  const { has, toggle } = useSaved();
  const [notice, setNotice] = useState('');
  const saved = has(dossierId);

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 2200);
  };

  const download = () => {
    const text = dossierToMarkdown(view);
    const fileName = `${safeFileName(view.title)}.md`;
    const native = bridge();
    if (native?.saveFile) {
      native.saveFile(toBase64(text), 'text/markdown', fileName);
      flash('Файл сохранён в Downloads');
      return;
    }
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const print = () => {
    const native = bridge();
    if (native?.printPage) {
      native.printPage(view.title);
      return;
    }
    window.print();
  };

  const share = async () => {
    const payload = `${view.title}\n\n${view.summary || ''}`;
    const native = bridge();
    if (native?.share) {
      native.share(payload);
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: view.title, text: view.summary, url: window.location.href });
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      flash('Ссылка скопирована');
    } catch {
      flash('Не удалось поделиться');
    }
  };

  return (
    <div className="dossier-actions">
      <button
        className={`ghost small ${saved ? 'active' : ''}`}
        onClick={() => toggle({ id: dossierId, title: view.title, kind: view.info?.type || view.eyebrow, path: `/dossier/${encodeURIComponent(dossierId)}` })}
      >
        <Bookmark size={15} /> {saved ? 'В сохранённых' : 'Сохранить'}
      </button>
      <button className="ghost small" onClick={download}><Download size={15} /> Markdown</button>
      <button className="ghost small" onClick={print}><Printer size={15} /> Печать / PDF</button>
      <button className="ghost small" onClick={share}>
        {notice ? <Check size={15} /> : navigator.share || bridge()?.share ? <Share2 size={15} /> : <Link2 size={15} />}
        {notice || 'Поделиться'}
      </button>
    </div>
  );
}
