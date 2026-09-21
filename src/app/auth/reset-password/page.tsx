import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f7ef] px-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(90,138,70,0.24),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(212,225,177,0.5),transparent_45%)]" />
      <section className="relative w-full max-w-md rounded-[2rem] border border-white/70 bg-white/85 p-8 shadow-2xl shadow-[#315b2c]/10 backdrop-blur-xl">
        <ResetPasswordForm token={token} />
      </section>
    </main>
  );
}
