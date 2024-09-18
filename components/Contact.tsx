import { useState } from "react";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Sending...");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setStatus("Message sent successfully!");
        setForm({ name: "", email: "", message: "" });
      } else {
        setStatus("Failed to send message.");
      }
    } catch (error) {
      setStatus("An error occurred.");
    }
  };

  return (
    <section id="contact" className="py-16 bg-gray-900 text-white">
      <h2 className="text-4xl font-bold text-center mb-12">Get in Touch</h2>
      <div className="max-w-xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block mb-2 font-medium">Name</label>
            <input
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              className="w-full p-3 rounded bg-gray-800 border border-gray-700"
              required
            />
          </div>
          <div>
            <label className="block mb-2 font-medium">Email</label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              className="w-full p-3 rounded bg-gray-800 border border-gray-700"
              required
            />
          </div>
          <div>
            <label className="block mb-2 font-medium">Message</label>
            <textarea
              name="message"
              value={form.message}
              onChange={handleChange}
              className="w-full p-3 rounded bg-gray-800 border border-gray-700"
              rows={5}
              required
            ></textarea>
          </div>
          <button type="submit" className="btn btn-primary w-full">
            Send Message
          </button>
          {status && <p className="text-center mt-4">{status}</p>}
        </form>
      </div>
    </section>
  );
}
