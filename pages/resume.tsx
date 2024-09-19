import React from "react";
import Head from "next/head";
import Link from "next/link";

export default function Resume() {
  return (
    <>
      <Head>
        <title>Resume - Trent Conley</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <div className="fixed inset-0 bg-gray-900 flex flex-col">
        {/* Download Button */}
        <div className="absolute top-4 right-4 z-50">
          <a
            href="/Trent Conley Resume.pdf"
            download
            className="px-4 py-2 bg-blue-500 text-white rounded shadow-lg hover:bg-blue-600 transition"
          >
            Download Resume
          </a>
        </div>

        {/* PDF Embed */}
        <iframe
          src="/Trent Conley Resume.pdf"
          className="w-full h-full border-0"
          title="Trent Conley Resume"
        ></iframe>
      </div>
    </>
  );
}
