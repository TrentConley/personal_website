import React from "react";
import Head from "next/head";

interface Book {
  title: string;
  author: string;
  coverImage: string;
}

const books: Book[] = [
  {
    title: "The Martian",
    author: "Andy Weir",
    coverImage: "/books/the-martian.jpg",
  },
  {
    title: "The Three-Body Problem",
    author: "Liu Cixin",
    coverImage: "/books/the-three-body-problem.jpg",
  },
  {
    title: "Ender's Game",
    author: "Orson Scott Card",
    coverImage: "/books/enders-game.jpg",
  },
  {
    title: "The Alchemist",
    author: "Paulo Coelho",
    coverImage: "/books/the-alchemist.jpg",
  },
  {
    title: "Rich Dad Poor Dad",
    author: "Robert T. Kiyosaki",
    coverImage: "/books/rich-dad-poor-dad.jpg",
  },
  {
    title: "12 Rules for Life",
    author: "Jordan B. Peterson",
    coverImage: "/books/12-rules-for-life.jpg",
  },
  {
    title: "1984",
    author: "George Orwell",
    coverImage: "/books/1984.jpg",
  },
  {
    title: "The Power of Habit",
    author: "Charles Duhigg",
    coverImage: "/books/the-power-of-habit.jpg",
  },
  {
    title: "The Odyssey",
    author: "Homer",
    coverImage: "/books/the-odyssey.jpg",
  },
  {
    title: "Meditations",
    author: "Marcus Aurelius",
    coverImage: "/books/meditations.jpg",
  },
  {
    title: "Atomic Habits",
    author: "James Clear",
    coverImage: "/books/atomic-habits.jpg",
  },
  {
    title: "To Kill a Mockingbird",
    author: "Harper Lee",
    coverImage: "/books/to-kill-a-mockingbird.jpg",
  },
  {
    title: "Power Score",
    author: "Hugh Dalziel & John P. O'Neill",
    coverImage: "/books/power-score.jpg",
  },
  {
    title: "The 7 Habits of Highly Effective People",
    author: "Stephen R. Covey",
    coverImage: "/books/the-7-habits-of-highly-effective-people.jpg",
  },
  {
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    coverImage: "/books/the-great-gatsby.jpg",
  },
  {
    title: "The Catcher in the Rye",
    author: "J.D. Salinger",
    coverImage: "/books/the-catcher-in-the-rye.jpg",
  },
  {
    title: "100M Offers",
    author: "Alex Hormozi",
    coverImage: "/books/100m-offers.jpg",
  },
];

const Books: React.FC = () => {
  return (
    <div className="relative min-h-screen bg-gray-50">
      <Head>
        <title>Books | Trent Conley</title>
        <meta
          name="description"
          content="A curated list of my favorite books."
        />
        <link rel="icon" href="/TC.png" />
      </Head>
      <main className="py-16 px-4">
        <h1 className="text-4xl font-bold text-center mb-12">Books</h1>
        <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {books.map((book, index) => (
            <div
              key={index}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300"
            >
              <img
                src={book.coverImage}
                alt={book.title}
                className="w-full h-60 object-cover"
              />
              <div className="p-4">
                <h2 className="text-xl font-semibold mb-2">{book.title}</h2>
                <h3 className="text-gray-600 mb-2">by {book.author}</h3>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Books;
