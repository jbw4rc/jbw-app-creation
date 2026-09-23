// Which sportsbooks you can actually bet at. Every recommendation on the board
// is priced at these books only — a great number at a book you do not have is
// not a bet you can make.
import { useState } from 'react';
import { bookName, bookTier } from '../lib/books';

export function BookPicker({
  available,
  selected,
  onChange,
}: {
  /** Every book key present in the latest poll. */
  available: string[];
  selected: string[];
  onChange: (books: string[]) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  // US retail books are where almost everyone bets, so they lead. Offshore and
  // European books stay one tap away rather than crowding the row.
  const retail = available.filter((b) => bookTier(b) === 'retail');
  const rest = available.filter((b) => bookTier(b) !== 'retail');
  const shown = showAll ? [...retail, ...rest] : [...retail, ...rest.filter((b) => selected.includes(b))];

  const toggle = (book: string) =>
    onChange(selected.includes(book) ? selected.filter((b) => b !== book) : [...selected, book]);

  return (
    <section className="picker">
      <span className="picker__k">Your books</span>
      <div className="picker__chips">
        {shown.map((b) => (
          <button
            key={b}
            className={`chip ${selected.includes(b) ? 'chip--on' : ''}`}
            onClick={() => toggle(b)}
            aria-pressed={selected.includes(b)}
          >
            {bookName(b)}
          </button>
        ))}
        {rest.length > 0 && (
          <button className="linkbtn" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'fewer books' : `+${rest.length} more`}
          </button>
        )}
      </div>
    </section>
  );
}
