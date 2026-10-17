import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioUnlocker } from './unlock';

/** Mimics iOS Safari: a new context starts "suspended" and only resume() starts it. */
class FakeAudioContext {
  state: AudioContextState | 'interrupted' = 'suspended';
  destination = {};
  resume = vi.fn(async () => {
    if (this.refuse) return;
    this.state = 'running';
  });
  refuse = false;
  played = 0;
  createBuffer() {
    return {};
  }
  createBufferSource() {
    return {
      buffer: null,
      connect: () => undefined,
      start: () => {
        this.played++;
      },
    };
  }
}

function setup() {
  const target = new EventTarget();
  const contexts: FakeAudioContext[] = [];
  const factory = vi.fn(() => {
    const ctx = new FakeAudioContext();
    contexts.push(ctx);
    return ctx as unknown as AudioContext;
  });
  const unlocker = new AudioUnlocker(factory, target as unknown as Document);
  return { target, contexts, factory, unlocker };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('AudioUnlocker', () => {
  beforeEach(() => {
    delete (navigator as unknown as { audioSession?: unknown }).audioSession;
  });

  it('does not create an AudioContext until the first gesture', async () => {
    const { target, factory, unlocker } = setup();
    unlocker.install();
    expect(factory).not.toHaveBeenCalled();
    expect(unlocker.context).toBeNull();

    target.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(unlocker.isRunning).toBe(true);
  });

  it('resumes and plays a silent buffer inside the gesture', async () => {
    const { target, contexts, unlocker } = setup();
    unlocker.install();
    target.dispatchEvent(new Event('touchend'));
    await flush();
    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
    expect(contexts[0].played).toBe(1);
  });

  it('stops listening once audio is running', async () => {
    const { target, contexts, factory, unlocker } = setup();
    unlocker.install();
    target.dispatchEvent(new Event('click'));
    await flush();
    target.dispatchEvent(new Event('click'));
    target.dispatchEvent(new Event('keydown'));
    await flush();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
  });

  it('retries on the next gesture when the browser blocks resume', async () => {
    const { target, unlocker, factory } = setup();
    // First context refuses to start, as Safari does outside a real gesture.
    factory.mockImplementationOnce(() => {
      const ctx = new FakeAudioContext();
      ctx.refuse = true;
      setTimeout(() => (ctx.refuse = false), 0);
      return ctx as unknown as AudioContext;
    });
    unlocker.install();
    target.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(unlocker.isRunning).toBe(false);

    target.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(unlocker.isRunning).toBe(true);
    expect(factory).toHaveBeenCalledTimes(1); // the same context is reused
  });

  it('resumes an interrupted context when the page becomes visible again', async () => {
    const { target, contexts, unlocker } = setup();
    unlocker.install();
    target.dispatchEvent(new Event('pointerdown'));
    await flush();
    contexts[0].state = 'interrupted'; // e.g. after a phone call on iOS
    target.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(contexts[0].resume).toHaveBeenCalledTimes(2);
    expect(contexts[0].state).toBe('running');
  });

  it('asks iOS to play through the silent switch when supported', async () => {
    const session = { type: 'auto' };
    (navigator as unknown as { audioSession: unknown }).audioSession = session;
    const { unlocker } = setup();
    await unlocker.unlock();
    expect(session.type).toBe('playback');
  });

  it('survives browsers without Web Audio', async () => {
    const unlocker = new AudioUnlocker(() => {
      throw new Error('nope');
    }, new EventTarget() as unknown as Document);
    await expect(unlocker.unlock()).resolves.toBeNull();
  });
});
