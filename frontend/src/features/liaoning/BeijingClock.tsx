import { useEffect, useState } from 'react';
import { formatBeijingClock } from './marketTime';
import './beijing-clock.css';

/** The second tick is local to this component; it never touches market or map state. */
export function BeijingClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: number | undefined;
    const synchronize = () => setNow(Date.now());
    const pause = () => { window.clearInterval(timer); timer = undefined; };
    const resume = () => {
      pause();
      if (document.visibilityState === 'hidden') return;
      synchronize();
      timer = window.setInterval(synchronize, 1000);
    };
    const focus = () => { if (document.visibilityState !== 'hidden') synchronize(); };
    resume();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', focus);
    return () => {
      pause();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', focus);
    };
  }, []);

  return <section className="beijing-clock" aria-label="北京时间" aria-live="off">
    <p className="beijing-clock__label">BEIJING TIME</p>
    <time className="beijing-clock__time" dateTime={new Date(now).toISOString()}>{formatBeijingClock(now)}</time>
    <p className="beijing-clock__zone">北京时间 UTC+08:00</p>
  </section>;
}
