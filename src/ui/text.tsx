import type { JSX } from 'preact';

/** Rende il grassetto scritto come `**parola**` nei testi di src/i18n/it.ts. */
export function Rich({ text }: { text: string }): JSX.Element {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
      )}
    </>
  );
}

export function Paragraphs({ items }: { items: readonly string[] }): JSX.Element {
  return (
    <>
      {items.map((item, i) => (
        <p key={i}>
          <Rich text={item} />
        </p>
      ))}
    </>
  );
}
