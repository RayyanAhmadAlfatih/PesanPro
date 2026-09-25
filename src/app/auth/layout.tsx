// Authentication documents must not enter the Full Route Cache. A cached HTML
// shell can otherwise outlive a deployment and reference CSS/JS hashes that no
// longer exist on a single-release self-hosted server.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
