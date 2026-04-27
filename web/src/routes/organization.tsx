// auth-better/web/src/routes/organization.tsx
// Route: /organization/:pathname?
// OrganizationView handles: settings, members, invitations, teams.
// useAuthenticate() inside — auto-redirects to sign-in if not signed in.

import { OrganizationView } from '@daveyplate/better-auth-ui';
import { useParams } from 'react-router-dom';

export function OrganizationRoute() {
  const { pathname } = useParams();
  return (
    <div className="container mx-auto flex w-full grow flex-col p-4 md:p-6">
      <div className="mb-6 rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Your Organisation</strong> — Manage your organisation's name, members and teams.
        Add members by inviting them via email. Assign roles to control what they can do.
        Teams let you group members together (e.g. "Engineering", "Design").
      </div>
      <OrganizationView pathname={pathname} />
    </div>
  );
}
