import { redirect } from 'next/navigation';

// `/administration` has no content of its own — send it to the unified Access
// Control Center (the default Administration surface). Previously this route 404'd.
export default function AdministrationIndexPage() {
  redirect('/administration/access-center');
}
