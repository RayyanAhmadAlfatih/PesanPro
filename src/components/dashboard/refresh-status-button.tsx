'use client';

import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Memuat ulang data server halaman ini. Status persetujuan berubah di sisi
 * admin, jadi satu refresh saja cukup; kalau sudah disetujui, dashboard
 * normal langsung menggantikan halaman tunggu.
 */
export function RefreshStatusButton() {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full sm:w-auto"
      onClick={() => router.refresh()}
    >
      <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
      Perbarui status
    </Button>
  );
}
