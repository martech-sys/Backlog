import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { loadDb } from './db';
import { env } from './env';
import { getStore } from './store';
import { isAllowedEmail } from './users';

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/login', error: '/login' },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: { params: { prompt: 'select_account' } },
    }),
  ],
  callbacks: {
    async signIn({ user, profile }) {
      const email = String(user.email || '').toLowerCase();
      if ((profile as { email_verified?: boolean } | undefined)?.email_verified === false) return false;
      const domain = email.split('@')[1] || '';
      if (env.allowedDomains.includes(domain)) return true;
      // Email di luar domain kantor boleh masuk bila terdaftar di Master_PIC / Master_Tim.
      try {
        const db = await loadDb(await getStore());
        return isAllowedEmail(db.master, email);
      } catch {
        return false;
      }
    },
  },
};
