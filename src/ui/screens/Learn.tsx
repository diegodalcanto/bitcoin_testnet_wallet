import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { learnCards, t } from '../../i18n/it';
import { navigate, paths } from '../../state/router';
import { Icon } from '../icons';
import { Paragraphs, Rich } from '../text';

/** Guida a schede, sempre consultabile: utile anche ai volontari per la spiegazione iniziale. */
export function Learn({ card }: { card: number }): JSX.Element {
  const total = learnCards.length;
  const initial = Math.min(Math.max(card - 1, 0), total - 1);
  const [index, setIndex] = useState(initial);
  const indexRef = useRef(initial);
  const trackRef = useRef<HTMLDivElement>(null);

  const select = (i: number) => {
    if (indexRef.current === i) return;
    indexRef.current = i;
    setIndex(i);
    navigate(paths.learn(i + 1), { replace: true });
  };

  const scrollTo = (i: number, smooth = true) => {
    const track = trackRef.current;
    const target = track?.children[i] as HTMLElement | undefined;
    if (!track || !target) return;
    track.scrollTo({ left: target.offsetLeft - track.offsetLeft - 16, behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => scrollTo(initial, false), []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = track.clientWidth;
        const i = Math.round(track.scrollLeft / Math.max(1, width - 20));
        select(Math.min(Math.max(i, 0), total - 1));
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [total]);

  const go = (i: number) => {
    const next = Math.min(Math.max(i, 0), total - 1);
    select(next);
    scrollTo(next);
  };

  return (
    <div>
      <div class="spread" style={{ marginBottom: '12px' }}>
        <h1 class="page-title" style={{ margin: 0 }}>
          {t.learn.title}
        </h1>
        <span class="muted small" aria-live="polite">
          {t.learn.of(index + 1, total)}
        </span>
      </div>
      <div class="carousel" ref={trackRef}>
        {learnCards.map((c, i) => (
          <article class="learn-card" key={c.id} aria-roledescription={t.learn.card} aria-label={`${i + 1}: ${c.title}`} data-testid="learn-card">
            <div class="icon" aria-hidden="true">
              {c.icon}
            </div>
            <h2>{c.title}</h2>
            <Paragraphs items={c.body} />
            {c.funFact && (
              <div class="fun-fact">
                <strong>{t.learn.funFact}</strong> <Rich text={c.funFact} />
              </div>
            )}
          </article>
        ))}
      </div>
      <div class="spread" style={{ marginTop: '4px' }}>
        <button type="button" class="icon-btn" aria-label={t.learn.prev} disabled={index === 0} onClick={() => go(index - 1)}>
          <Icon name="arrowLeft" />
        </button>
        <div class="dots">
          {learnCards.map((c, i) => (
            <button type="button" key={c.id} aria-label={c.title} aria-current={i === index} onClick={() => go(i)} />
          ))}
        </div>
        <button type="button" class="icon-btn" aria-label={t.learn.next} disabled={index === total - 1} onClick={() => go(index + 1)}>
          <Icon name="arrowRight" />
        </button>
      </div>
    </div>
  );
}
