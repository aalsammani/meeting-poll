export default function Privacy() {
  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl">Privacy</h1>
      <p className="text-ink-soft">This page describes what the scheduling tool stores and who can see it.</p>

      <section className="space-y-2">
        <h2 className="text-xl">What is stored when you respond to a poll</h2>
        <ul className="list-disc space-y-1 pl-5 text-ink-soft">
          <li>The name you enter.</li>
          <li>Your email address, only if you choose to provide one. It is used to send you a private link for editing your response.</li>
          <li>The times you mark as available or “if needed”, and when you submitted or last changed them.</li>
          <li>A one-way hash (not the address itself) of your network address, kept for 24 hours to limit automated abuse.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl">Who can see it</h2>
        <ul className="list-disc space-y-1 pl-5 text-ink-soft">
          <li>Anyone with the poll link can see participants' names and availability. Treat the link as semi-public.</li>
          <li>Email addresses are visible only to the poll's organizer, never on the public results page.</li>
          <li>The organizer receives an email notification with your name and selected times each time you respond.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl">How long it is kept</h2>
        <p className="text-ink-soft">
          Responses are kept until the organizer deletes the poll, which removes every response with it. You can change
          your own response at any time using the private edit link shown after you submit.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl">Where it is stored</h2>
        <p className="text-ink-soft">
          Data is stored in a hosted PostgreSQL database (Supabase) and notification email is sent through a transactional
          email provider (Resend). No analytics or advertising trackers are used.
        </p>
      </section>

      <p className="text-[15px] text-ink-mute">
        This notice describes the software's behavior; it is not a statement of compliance with any specific regulation.
        Organizers should follow their institution's data-handling policies.
      </p>
    </article>
  );
}
