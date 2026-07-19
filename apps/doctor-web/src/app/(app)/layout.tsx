import { requireDoctor } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";
import { DoctorKeyBootstrap } from "@/components/doctor-key-bootstrap";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const doctor = await requireDoctor();
  return (
    <>
      <header className="topbar">
        <div className="brand">
          HeyJule <span>· {doctor.name}</span>
        </div>
        <div className="topbar-actions">
          <DoctorKeyBootstrap />
          <SignOutButton />
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
