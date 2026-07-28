export type Project = {
  name: string;
  summary: string;
  links: Array<{
    label: string;
    url: string;
  }>;
};

export const projects: Project[] = [
  {
    name: "Eye-Controlled Drone",
    summary:
      "A computer-vision interface that maps eye movement and head tilt to four degrees of drone flight control.",
    links: [
      { label: "github", url: "https://github.com/TrentConley/Drone" },
      { label: "video", url: "https://www.youtube.com/watch?v=lf6IOTpSvVg" },
    ],
  },
  {
    name: "Lexara.io",
    summary:
      "An AI co-pilot that brings contextual suggestions and feedback directly into Google Docs.",
    links: [{ label: "site", url: "https://lexara.io" }],
  },
  {
    name: "Easy Deep Learning",
    summary:
      "A no-code interface for fine-tuning image classifiers with synthetic data expansion.",
    links: [
      { label: "github", url: "https://github.com/TrentConley/Hacklytics" },
      { label: "video", url: "https://www.youtube.com/watch?v=Ci80FKm_ACc" },
    ],
  },
];
