import { useState } from 'react';
import { ShareIcon } from './Icons';
import { Button } from './ui';

export function appUrl(): string {
  // Share the app's home, without any tab in the hash.
  return `${location.origin}${location.pathname}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers: fall back to a hidden textarea.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

export function ShareButton({ className }: { className?: string }) {
  const [status, setStatus] = useState<string>('');

  const share = async () => {
    const url = appUrl();
    const data = {
      title: 'Stillpoint',
      text: 'A calm, free meditation timer and breathing guide. No sign-up, works offline.',
      url,
    };
    if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch (err) {
        if ((err as DOMException).name === 'AbortError') return;
      }
    }
    const copied = await copyText(url);
    setStatus(copied ? 'Link copied — paste it to a friend.' : `Copy this link: ${url}`);
    window.setTimeout(() => setStatus(''), 5000);
  };

  return (
    <div className={className}>
      <Button variant="primary" className="w-full" onClick={share}>
        <ShareIcon size={20} />
        Share this app
      </Button>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-center text-sm text-muted">
        {status}
      </p>
    </div>
  );
}
