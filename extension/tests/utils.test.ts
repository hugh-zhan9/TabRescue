import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { findTabIndexByKey } from '../src/utils/dedup';
import { shouldCollect, shouldCollectUrl } from '../src/utils/urlFilter';

describe('URL Filter', () => {
  it('should collect normal HTTP URLs', () => {
    expect(shouldCollectUrl('https://example.com')).toBe(true);
    expect(shouldCollectUrl('http://example.com')).toBe(true);
  });

  it('should not collect chrome:// URLs', () => {
    expect(shouldCollectUrl('chrome://settings')).toBe(false);
    expect(shouldCollectUrl('chrome://newtab')).toBe(false);
  });

  it('should not collect about: URLs', () => {
    expect(shouldCollectUrl('about:blank')).toBe(false);
    expect(shouldCollectUrl('about:newtab')).toBe(false);
  });

  it('should not collect extension URLs', () => {
    expect(shouldCollectUrl('chrome-extension://abc123/popup.html')).toBe(false);
  });

  it('should not collect data: URLs', () => {
    expect(shouldCollectUrl('data:text/html,<h1>Test</h1>')).toBe(false);
  });
});

describe('Dedup Strategy', () => {
  const tabs = [
    { url: 'https://example.com', windowId: '1', tabIndex: 0 },
    { url: 'https://google.com', windowId: '1', tabIndex: 1 },
    { url: 'https://example.com', windowId: '2', tabIndex: 0 },
  ];

  it('strict: should find by URL only', () => {
    const index = findTabIndexByKey(tabs as any, 'https://example.com', '2', 'strict');
    expect(index).toBe(0);
  });

  it('per-window: should find by URL and windowId', () => {
    const index = findTabIndexByKey(tabs as any, 'https://example.com', '2', 'per-window');
    expect(index).toBe(2);
  });

  it('none: should never find', () => {
    const index = findTabIndexByKey(tabs as any, 'https://example.com', '1', 'none');
    expect(index).toBe(-1);
  });
});
