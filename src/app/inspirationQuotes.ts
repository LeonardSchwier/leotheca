/**
 * A small curated set of stoic and classical philosophy quotes shown in
 * the editor area when no note is open (see EmptyEditorState in App.tsx),
 * instead of a bare "No file open." message.
 *
 * Every line here is an original paraphrase of a source old enough to be
 * unambiguously in the public domain (the philosophers themselves wrote
 * roughly two thousand years ago), not a verbatim quote copied from any
 * specific modern copyrighted translation, so this file carries no
 * copyright risk on its own.
 */

export interface InspirationQuote {
  text: string;
  author: string;
}

export const INSPIRATION_QUOTES: InspirationQuote[] = [
  {
    text: "You have power over your mind, not outside events. Realize this, and you will find strength.",
    author: "Marcus Aurelius",
  },
  {
    text: "We suffer more often in imagination than in reality.",
    author: "Seneca",
  },
  {
    text: "It is not that we have a short time to live, but that we waste a great deal of it.",
    author: "Seneca",
  },
  {
    text: "People are disturbed not by things, but by the views they take of them.",
    author: "Epictetus",
  },
  {
    text: "Waste no more time arguing what a good person should be. Be one.",
    author: "Marcus Aurelius",
  },
  {
    text: "First decide who you wish to be, then do what you have to do.",
    author: "Epictetus",
  },
  {
    text: "It is in our power not to long for what we lack, and to make good use of what we have.",
    author: "Seneca",
  },
  {
    text: "Confine yourself to the present.",
    author: "Marcus Aurelius",
  },
  {
    text: "How much trouble he avoids who pays no attention to what his neighbor says or does.",
    author: "Marcus Aurelius",
  },
  {
    text: "If it is not right, do not do it. If it is not true, do not say it.",
    author: "Marcus Aurelius",
  },
];

export function pickRandomQuote(): InspirationQuote {
  const index = Math.floor(Math.random() * INSPIRATION_QUOTES.length);
  return INSPIRATION_QUOTES[index];
}
