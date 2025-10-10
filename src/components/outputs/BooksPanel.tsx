import type { Book } from "../../data/profile";

type BooksPanelProps = {
  books: Book[];
};

export function BooksPanel({ books }: BooksPanelProps) {
  const midpoint = Math.ceil(books.length / 2);
  const columns = [books.slice(0, midpoint), books.slice(midpoint)];

  return (
    <div className="panel">
      <span className="panel__label">cat library/recommended.txt</span>
      <div className="columns columns--two">
        {columns.map((column, columnIndex) => (
          <ul key={columnIndex} className="books-list">
            {column.map((book) => (
              <li key={book.title} className="books-list__item">
                <strong>{book.title}</strong> — {book.author}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
