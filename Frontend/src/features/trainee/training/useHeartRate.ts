import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Live heart rate (BPM) from a watch or chest strap, over Web Bluetooth (QA #91).
 * Works with anything that broadcasts the standard Bluetooth "Heart Rate" service (Polar, Garmin, Wahoo, many watches
 * with "broadcast heart rate" turned on) in Chrome / Edge / Android. iPhone Safari does not offer Web Bluetooth, so
 * `supported` is false there and the button stays hidden.
 */
type Status = 'idle' | 'connecting' | 'live' | 'error';

type BtCharacteristic = EventTarget & { value?: DataView; startNotifications(): Promise<BtCharacteristic> };
type BtDevice = EventTarget & {
  name?: string;
  gatt?: { connected: boolean; connect(): Promise<{ getPrimaryService(s: string | number): Promise<{ getCharacteristic(c: string | number): Promise<BtCharacteristic> }> ; disconnect(): void }> ; disconnect(): void };
};
type BtNav = { bluetooth?: { requestDevice(o: unknown): Promise<BtDevice> } };

/** Heart Rate Measurement: flags bit 0 tells whether the value is 8-bit or 16-bit. */
export const parseHeartRate = (v: DataView): number => ((v.getUint8(0) & 0x01) ? v.getUint16(1, true) : v.getUint8(1));

export function useHeartRate() {
  const supported = typeof navigator !== 'undefined' && !!(navigator as unknown as BtNav).bluetooth;
  const [status, setStatus] = useState<Status>('idle');
  const [bpm, setBpm] = useState<number | null>(null);
  const [name, setName] = useState('');
  const devRef = useRef<BtDevice | null>(null);

  const disconnect = useCallback(() => {
    try { devRef.current?.gatt?.disconnect(); } catch { /* already gone */ }
    devRef.current = null;
    setBpm(null);
    setStatus('idle');
  }, []);

  const connect = useCallback(async () => {
    const bt = (navigator as unknown as BtNav).bluetooth;
    if (!bt) return;
    setStatus('connecting');
    try {
      const device = await bt.requestDevice({ filters: [{ services: ['heart_rate'] }] });
      devRef.current = device;
      setName(device.name ?? '');
      device.addEventListener('gattserverdisconnected', () => { setBpm(null); setStatus('idle'); });
      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService('heart_rate');
      const ch = await service.getCharacteristic('heart_rate_measurement');
      ch.addEventListener('characteristicvaluechanged', (e) => {
        const v = (e.target as BtCharacteristic).value;
        if (v) setBpm(parseHeartRate(v));
      });
      await ch.startNotifications();
      setStatus('live');
    } catch (err) {
      // closing the device picker is not an error
      const cancelled = err instanceof Error && err.name === 'NotFoundError';
      devRef.current = null;
      setStatus(cancelled ? 'idle' : 'error');
    }
  }, []);

  useEffect(() => () => { try { devRef.current?.gatt?.disconnect(); } catch { /* ignore */ } }, []);

  return { supported, status, bpm, name, connect, disconnect };
}
