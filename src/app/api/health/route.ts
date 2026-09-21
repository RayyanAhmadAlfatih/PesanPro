import { GET as getReadiness } from "./ready/route";

export const dynamic = "force-dynamic";

export async function GET() {
  return getReadiness();
}
