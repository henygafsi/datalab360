import { redirect } from 'next/navigation';

/** /studio/settings — legacy URL, consolidated into /studio/admin. */
export default function LegacySettingsRedirect() {
  redirect('/studio/admin');
}
