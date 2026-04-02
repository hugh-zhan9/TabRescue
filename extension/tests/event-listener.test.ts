import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventListener } from '../src/background/EventListener';

async function flushMicrotasks(times: number = 8) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

describe('EventListener', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.chrome = {
      tabs: {
        onCreated: { addListener: jest.fn() },
        onRemoved: { addListener: jest.fn() },
        onUpdated: { addListener: jest.fn() },
        onMoved: { addListener: jest.fn() },
        onActivated: { addListener: jest.fn() },
      },
      windows: {
        onCreated: { addListener: jest.fn() },
        onRemoved: { addListener: jest.fn() },
        onFocusChanged: { addListener: jest.fn() },
      },
      runtime: {
        onInstalled: { addListener: jest.fn() },
        onStartup: { addListener: jest.fn() },
      },
      alarms: {
        onAlarm: { addListener: jest.fn() },
        create: jest.fn(),
        clear: jest.fn().mockResolvedValue(undefined),
      },
    } as any;
  });

  it('should attempt a snapshot before the last tracked window finishes closing', async () => {
    const tracker = {
      onTabCreated: jest.fn(),
      onTabClosed: jest.fn().mockResolvedValue(undefined),
      onTabUpdated: jest.fn(),
      onTabMoved: jest.fn(),
      onTabActivated: jest.fn(),
      onWindowCreated: jest.fn(),
      onWindowClosed: jest.fn(),
      onWindowFocused: jest.fn(),
      initialize: jest.fn(),
      fullCapture: jest.fn(),
      getSettings: jest.fn().mockResolvedValue({ snapshot: { autoSaveInterval: 5 } }),
      isLastTrackedWindow: jest.fn().mockResolvedValue(true),
    } as any;

    const snapshotService = {
      createSnapshot: jest.fn().mockResolvedValue(undefined),
    } as any;

    const listener = new EventListener(tracker, snapshotService);
    listener.setup();

    const onRemoved = (chrome.tabs.onRemoved.addListener as jest.Mock).mock.calls[0][0];
    onRemoved(123, { windowId: 7, isWindowClosing: true });
    await flushMicrotasks();

    expect(snapshotService.createSnapshot).toHaveBeenCalledTimes(1);
    expect(tracker.onTabClosed).toHaveBeenCalledWith(123, 7);
  });

  it('should queue a follow-up event snapshot while one is already running', async () => {
    const tracker = {
      onTabCreated: jest.fn().mockResolvedValue(undefined),
      onTabClosed: jest.fn(),
      onTabUpdated: jest.fn(),
      onTabMoved: jest.fn(),
      onTabActivated: jest.fn(),
      onWindowCreated: jest.fn(),
      onWindowClosed: jest.fn(),
      onWindowFocused: jest.fn(),
      initialize: jest.fn(),
      fullCapture: jest.fn(),
      getSettings: jest.fn().mockResolvedValue({ snapshot: { autoSaveInterval: 5 } }),
      isLastTrackedWindow: jest.fn().mockResolvedValue(false),
    } as any;

    let resolveFirstSnapshot: (() => void) | null = null;
    const firstSnapshotPromise = new Promise<void>((resolve) => {
      resolveFirstSnapshot = resolve;
    });

    const snapshotService = {
      createSnapshot: jest
        .fn()
        .mockImplementationOnce(() => firstSnapshotPromise)
        .mockResolvedValue(undefined),
    } as any;

    const listener = new EventListener(tracker, snapshotService);
    listener.setup();

    const onCreated = (chrome.tabs.onCreated.addListener as jest.Mock).mock.calls[0][0];
    onCreated({ id: 1, url: 'https://example.com', windowId: 7, title: 'Example', index: 0, pinned: false });
    await flushMicrotasks();

    expect(snapshotService.createSnapshot).toHaveBeenCalledTimes(1);

    onCreated({ id: 2, url: 'https://example.org', windowId: 7, title: 'Example 2', index: 1, pinned: false });
    await flushMicrotasks();

    expect(snapshotService.createSnapshot).toHaveBeenCalledTimes(1);

    resolveFirstSnapshot?.();
    await flushMicrotasks();

    expect(snapshotService.createSnapshot).toHaveBeenCalledTimes(2);
    expect(tracker.onTabCreated).toHaveBeenCalledTimes(2);
  });
});
