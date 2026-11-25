import { auth } from "@/lib/auth";
import { getEffectiveEntitlement, SubscriptionInactiveError } from "@/lib/billing";
import { MediaLibrary } from "@/components/dashboard/media-library";

export default async function MediaPage() {
  const session = await auth();
  let storageLimitBytes: number | null = null;

  if (session?.user?.id && session.user.accountActive !== false) {
    try {
      // Display only: the media API remains the authority for quota and storage.
      const entitlement = await getEffectiveEntitlement(session.user.id, "MEDIA_STORAGE_BYTES");
      storageLimitBytes = entitlement.enabled
        ? (entitlement.limit === null ? null : Number(entitlement.limit))
        : 0;
    } catch (error) {
      if (!(error instanceof SubscriptionInactiveError)) throw error;
      storageLimitBytes = 0;
    }
  }

  return <MediaLibrary storageLimitBytes={storageLimitBytes} />;
}
