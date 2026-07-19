import Link from "next/link";
import { requireDoctor } from "@/lib/session";
import { heyJuleApi } from "@/lib/heyjule-api";
import { generateInviteCode, revokeInviteCode } from "./actions";

function age(dateOfBirth: string) {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) years--;
  return years;
}

function relativeDay(iso: string | null) {
  if (!iso) return "no entries yet";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "logged today";
  if (days === 1) return "logged yesterday";
  return `logged ${days} days ago`;
}

export default async function DashboardPage() {
  await requireDoctor();
  const [patients, invites] = await Promise.all([
    heyJuleApi.listPatients(),
    heyJuleApi.listInvites(),
  ]);

  return (
    <>
      <h1>Patients</h1>

      <section className="section" aria-label="Linked patients">
        {patients.length === 0 ? (
          <p className="empty">
            No linked patients yet. Share an invite code below — when a patient
            enters it in the HeyJule app and consents, their brief appears here.
          </p>
        ) : (
          <ul className="patient-list">
            {patients.map((p) => (
              <li key={p.id}>
                <Link className="patient-row" href={`/patients/${p.id}`}>
                  <div>
                    <div>{p.profile?.name ?? "Patient profile pending"}</div>
                    <div className="meta">
                      {p.profile ? `${age(p.profile.dateOfBirth)} · ${p.profile.sex}` : p.id}
                    </div>
                  </div>
                  <div className="meta">{relativeDay(p.lastEntryAt)}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Invite a patient</h2>
        {invites.length > 0 && (
          <ul className="patient-list" aria-label="Pending invite codes">
            {invites.map((invite) => (
              <li key={invite.id}>
                <div className="invite-row">
                  <span className="invite-code">{invite.code}</span>
                  <form action={revokeInviteCode}>
                    <input type="hidden" name="inviteId" value={invite.id} />
                    <button className="button-quiet">Revoke</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form action={generateInviteCode} style={{ marginTop: "0.75rem" }}>
          <button className="button-primary">New invite code</button>
        </form>
      </section>
    </>
  );
}
