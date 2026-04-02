import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventListener } from '../src/background/EventListener';

describe('EventListener', () => {
  beforeEach(() => {
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
      isLastTrackedWindow: jest.fn().mockResolvedValue(true),
    } as any;

    const snapshotService = {
      createSnapshot: jest.fn().mockResolvedValue(undefined),
    } as any;

    const listener = new EventListener(tracker, snapshotService);
    await listener.setup();

    const onRemoved = (chrome.tabs.onRemoved.addListener as jest.Mock).mock.calls[0][0];
    await onRemoved(123, { windowId: 7, isWindowClosing: true });

    expect(snapshotService.createSnapshot).toHaveBeenCalledTimes(1);
    expect(tracker.onTabClosed).toHaveBeenCalledWith(123, 7);
  });
});
