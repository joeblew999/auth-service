// auth-better/web/src/routes/account.tsx
// Route: /account/:pathname?
// AccountView handles auth protection, sidebar nav, settings/security/api-keys tabs.

import { AccountView } from '@daveyplate/better-auth-ui';
import { useParams } from 'react-router-dom';

const HELP: Record<string, string> = {
  settings:      'Your profile — change your name, username, avatar and email address.',
  security:      'Keep your account secure — change your password, set up two-factor authentication (2FA), or add a passkey (Touch ID / Face ID) so you never need a password.',
  'api-keys':    'API Keys let scripts and other apps access your account without a password. Create a key here and use it in your code.',
  teams:         'Teams are groups within an organisation. You can belong to multiple teams, each with different permissions.',
  organizations: 'Organisations let you collaborate with other people. Create one, invite members, and assign roles to control what they can do.',
}

export function AccountRoute() {
  const { pathname } = useParams();
  const help = HELP[pathname ?? 'settings'];
  return (
    <div className="container mx-auto flex w-full grow flex-col p-4 md:p-6">
      {help && (
        <div className="mb-6 rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
          {help}
        </div>
      )}
      <AccountView pathname={pathname} showTeams />
    </div>
  );
}
