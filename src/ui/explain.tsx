import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useId, useState } from 'preact/hooks';
import { explain, t, type ExplainTopic } from '../i18n/it';
import { settings } from '../state/settings';
import { Icon } from './icons';
import { Paragraphs } from './text';

/** Stato aperto/chiuso di un box "i": parte aperto se "Mostra spiegazioni" è attivo. */
export function useExplainState(): [boolean, () => void] {
  const showAll = settings.value.showExplanations;
  const [open, setOpen] = useState(showAll);
  useEffect(() => setOpen(showAll), [showAll]);
  return [open, () => setOpen((o) => !o)];
}

export function InfoButton({ topic, open, onToggle, controls }: { topic: ExplainTopic; open: boolean; onToggle: () => void; controls: string }): JSX.Element {
  return (
    <button
      type="button"
      class="info-btn"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`${open ? t.common.explainClose : t.common.explainOpen}: ${explain[topic].title}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <Icon name="info" />
    </button>
  );
}

export function ExplainBox({ topic, id }: { topic: ExplainTopic; id: string }): JSX.Element {
  const item = explain[topic];
  return (
    <div class="explain" id={id} role="note">
      <h3>{item.title}</h3>
      <Paragraphs items={item.body} />
    </div>
  );
}

/** Etichetta con icona "i" e spiegazione sotto il contenuto. */
export function Explainable({ topic, label, children, class: className }: { topic: ExplainTopic; label: ComponentChildren; children?: ComponentChildren; class?: string }): JSX.Element {
  const [open, toggle] = useExplainState();
  const id = useId();
  return (
    <div class={className}>
      <div class="label-row">
        <span>{label}</span>
        <InfoButton topic={topic} open={open} onToggle={toggle} controls={id} />
      </div>
      {children}
      {open && <ExplainBox topic={topic} id={id} />}
    </div>
  );
}

/** Titolo di sezione con icona "i". */
export function SectionTitle({ topic, children, level = 2 }: { topic: ExplainTopic; children: ComponentChildren; level?: 2 | 3 }): JSX.Element {
  const [open, toggle] = useExplainState();
  const id = useId();
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div class="section-head">
      <div class="section-title">
        <Heading>{children}</Heading>
        <InfoButton topic={topic} open={open} onToggle={toggle} controls={id} />
      </div>
      {open && <ExplainBox topic={topic} id={id} />}
    </div>
  );
}

/** Solo il pulsante "i" con il suo box, da mettere accanto a un elemento qualsiasi. */
export function InlineExplain({ topic, children }: { topic: ExplainTopic; children?: ComponentChildren }): JSX.Element {
  const [open, toggle] = useExplainState();
  const id = useId();
  return (
    <>
      <div class="row">
        {children}
        <InfoButton topic={topic} open={open} onToggle={toggle} controls={id} />
      </div>
      {open && <ExplainBox topic={topic} id={id} />}
    </>
  );
}
