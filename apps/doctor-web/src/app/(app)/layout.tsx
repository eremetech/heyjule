import { requireDoctor } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const doctor = await requireDoctor();
  return (
    <>
      <header className="topbar">
        <div className="brand">
          HeyJule <span>· {doctor.name}</span>
        </div>
        <SignOutButton />
      </header>
      <main className="page">{children}</main>
    </>
  );
}
