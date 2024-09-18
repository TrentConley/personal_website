export default function Contact() {
  return (
    <section id="contact" className="py-16 bg-gray-900 text-white">
      <h2 className="text-4xl font-bold text-center mb-12">Get in Touch</h2>
      <div className="max-w-xl mx-auto">
        <form action="#" method="POST" className="space-y-6">
          <div>
            <label className="block mb-2 font-medium">Name</label>
            <input
              type="text"
              className="w-full p-3 rounded bg-gray-800 border border-gray-700"
              required
            />
          </div>
          <div>
            <label className="block mb-2 font-medium">Email</label>
            <input
              type="email"
              className="w-full p-3 rounded bg-gray-800 border border-gray-700"
              required
            />
          </div>
          <div>
            <label className="block mb-2 font-medium">Message</label>
            <textarea
              className="w-full p-3 rounded bg-gray-800 border border-gray-700"
              rows="5"
              required
            ></textarea>
          </div>
          <button type="submit" className="btn btn-primary w-full">
            Send Message
          </button>
        </form>
      </div>
    </section>
  );
}
