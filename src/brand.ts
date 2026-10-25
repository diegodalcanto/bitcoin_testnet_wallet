/**
 * Loghi mostrati nell'app (file in public/brand/). Per sostituirli basta mettere i nuovi file
 * in public/brand/ e aggiornare i nomi qui (vedi public/brand/README.md).
 */
export const BRAND = {
  meetup: { file: 'brand/meetup-pisa.webp', alt: 'Bitcoin Meetup Pisa', width: 620, height: 343 },
  festival: { file: 'brand/internet-festival.png', alt: 'Internet Festival – Forme di futuro', width: 663, height: 333 },
  /** Versione con la scritta chiara, per il tema scuro. */
  festivalDark: { file: 'brand/internet-festival-dark.png', alt: 'Internet Festival – Forme di futuro', width: 663, height: 333 },
} as const;
