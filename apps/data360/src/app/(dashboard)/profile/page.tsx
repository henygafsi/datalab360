import ProfileView from '@/app/shared/profile/profile-view';
import { metaObject } from '@/config/site.config';

export const metadata = {
  ...metaObject('Profile'),
};

export default function ProfilePage() {
  return <ProfileView />;
}
