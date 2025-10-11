export type Link = {
  label: string;
  url: string;
};

export type Project = {
  name: string;
  summary: string;
  focus: string;
  stack: string[];
  links: Link[];
};

export type Book = {
  title: string;
  author: string;
};

export const profile = {
  name: "Trent Conley",
  handle: "trent@console",
  title: "AI Engineer @ SpaceX",
  tagline:
    "AI Engineer at SpaceX, putting Grok on Mars • Georgia Tech CS • Building intelligent systems that stay in the loop.",
  location: "Los Angeles, CA",
  focusAreas: [
    "Full-stack product architecture",
    "Applied machine learning & computer vision",
    "Autonomous drones and control systems",
    "High-velocity startup execution",
  ],
  availability: [],
  contact: {
    email: "tconley7@gatech.edu",
    phone: "+1 (650) 714-1773",
    github: "https://github.com/TrentConley",
    resume: "/Trent Conley Resume.pdf",
  },
};

export const projects: Project[] = [
  {
    name: "Lexara.io",
    summary:
      "AI co-pilot for Google Docs that injects contextual suggestions, feedback, and insights straight into existing writing workflows.",
    focus:
      "Designed end-to-end system with secure auth, real-time collaboration, and enterprise controls.",
    stack: ["React", "Node.js", "MongoDB", "OpenAI"],
    links: [{ label: "site", url: "https://lexara.io" }],
  },
  {
    name: "Eye-Controlled Drone",
    summary:
      "Computer-vision interface that maps eye movement, gaze, and head tilt to four degrees of drone flight control.",
    focus:
      "Created CNN-based classifier with real-time inference, calibration pipeline, and ArduPilot integration.",
    stack: ["Python", "TensorFlow", "OpenCV", "ArduPilot"],
    links: [
      { label: "github", url: "https://github.com/TrentConley/Drone" },
      { label: "video", url: "https://www.youtube.com/watch?v=lf6IOTpSvVg" },
    ],
  },
  {
    name: "Revest FNFT Streaming",
    summary:
      "Token streaming primitives that mint one FNFT per second to unlock linear and quadratic withdrawal schedules.",
    focus:
      "Extended RevestV2 contracts with batch minting, withdrawal guards, and thorough test coverage.",
    stack: ["Solidity", "Hardhat", "TypeScript"],
    links: [
      {
        label: "github",
        url: "https://github.com/TrentConley/RevestV2-Streaming",
      },
      {
        label: "demo",
        url: "https://app.buidlbox.io/projects/token-str?path=projects%2Ftoken-str",
      },
    ],
  },
  {
    name: "True Persona AI Website",
    summary:
      "Rapid-delivery marketing site used in fundraising demos to showcase team-composition generative AI.",
    focus:
      "Built responsive storytelling flow aligned to sales narrative; powered over a dozen investor demos.",
    stack: ["Next.js", "Tailwind", "Vercel"],
    links: [{ label: "site", url: "https://team-builder2.vercel.app/" }],
  },
  {
    name: "Easy Deep Learning",
    summary:
      "Drag-and-drop interface that fine-tunes image classifiers with synthetic data expansion during Hacklytics 2024.",
    focus:
      "Leveraged Stable Diffusion for augmentation, produced deployable models that flag flood damage with scarce data.",
    stack: ["Next.js", "Firebase", "Flask", "Intel DevCloud"],
    links: [
      { label: "github", url: "https://github.com/TrentConley/Hacklytics" },
      { label: "devfolio", url: "https://devfolio.co/projects/easy-deep-learning-5b92" },
      { label: "video", url: "https://www.youtube.com/watch?v=Ci80FKm_ACc" },
    ],
  },
];

export const books: Book[] = [
  { title: "The Martian", author: "Andy Weir" },
  { title: "The Three-Body Problem", author: "Liu Cixin" },
  { title: "Ender's Game", author: "Orson Scott Card" },
  { title: "The Alchemist", author: "Paulo Coelho" },
  { title: "Rich Dad Poor Dad", author: "Robert T. Kiyosaki" },
  { title: "12 Rules for Life", author: "Jordan B. Peterson" },
  { title: "1984", author: "George Orwell" },
  { title: "The Power of Habit", author: "Charles Duhigg" },
  { title: "The Odyssey", author: "Homer" },
  { title: "Meditations", author: "Marcus Aurelius" },
  { title: "Atomic Habits", author: "James Clear" },
  { title: "To Kill a Mockingbird", author: "Harper Lee" },
  { title: "Power Score", author: "Hugh Dalziel & John P. O'Neill" },
  { title: "The 7 Habits of Highly Effective People", author: "Stephen R. Covey" },
  { title: "The Great Gatsby", author: "F. Scott Fitzgerald" },
  { title: "The Catcher in the Rye", author: "J.D. Salinger" },
  { title: "100M Offers", author: "Alex Hormozi" },
];
