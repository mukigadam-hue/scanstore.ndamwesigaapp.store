import { Link } from "react-router-dom";
import { ArrowLeft, Shield, Lock, Database, Eye, Mail, Globe, FileText, UserCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const LAST_UPDATED = "June 23, 2026";

const Section = ({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) => (
  <section className="wood-panel border border-border rounded-lg p-5 md:p-6">
    <div className="flex items-center gap-3 mb-3">
      <div className="brass-gradient rounded-md p-2">
        <Icon className="h-4 w-4 text-primary-foreground" />
      </div>
      <h2 className="font-display text-xl font-bold brass-text">{title}</h2>
    </div>
    <div className="text-sm text-foreground/85 leading-relaxed space-y-2">{children}</div>
  </section>
);

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <header className="wood-panel border-b border-border sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="font-display font-semibold brass-text text-sm">DocLocker Privacy</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <div className="text-center mb-2">
          <h1 className="font-display text-3xl md:text-4xl font-bold brass-text mb-2">
            Privacy Policy
          </h1>
          <p className="text-xs text-muted-foreground">Last updated: {LAST_UPDATED}</p>
          <p className="mt-4 text-sm text-muted-foreground max-w-xl mx-auto">
            This page is maintained by the DocLocker app owner to explain how your
            documents and personal data are handled inside the app. Your privacy
            and the safety of your documents are our top priority.
          </p>
        </div>

        <Section icon={FileText} title="1. Who We Are">
          <p>
            DocLocker is a personal document vault that lets you scan, store,
            organize, view, and protect your important files (IDs, certificates,
            receipts, photos, PDFs and more) behind multi-factor security.
          </p>
          <p>
            This policy describes what information the app collects, how it is
            used, where it is stored, and the choices you have. By creating an
            account or using DocLocker you agree to this policy.
          </p>
        </Section>

        <Section icon={Database} title="2. Information We Collect">
          <p><strong>Account information.</strong> Email address, optional phone number and country code, hashed password and (where applicable) hashed PIN, and the authentication method you choose (email, Google, or phone + PIN).</p>
          <p><strong>Security setup.</strong> The factors you register during security setup — including a chosen face/ID image, a passkey/WebAuthn credential, a school name, a family member's name, recovery questions, and one-time codes. Sensitive answers are stored as references and protected images, not as plain text where it would weaken security.</p>
          <p><strong>Your documents.</strong> The files you upload, scan, or save to your drawers, together with their name, size, file type, the drawer they live in, and timestamps.</p>
          <p><strong>Subscription &amp; usage.</strong> Your current plan, storage usage, drawer counts, and basic activity needed to enforce limits and auto-lock the vault.</p>
          <p><strong>Device &amp; technical data.</strong> Browser type, language preference, and limited diagnostics needed to keep the app working (for example, to recover from a failed upload).</p>
          <p>We do <strong>not</strong> sell your data, and we do <strong>not</strong> mine the contents of your documents to build advertising profiles about you.</p>
        </Section>

        <Section icon={Eye} title="3. How We Use Your Information">
          <ul className="list-disc pl-5 space-y-1">
            <li>To create and secure your account and verify your identity.</li>
            <li>To store, display, edit, and let you download your documents.</li>
            <li>To run multi-factor verification, auto-lock, and account recovery.</li>
            <li>To enforce free / premium storage limits and process upgrades.</li>
            <li>To detect abuse, prevent unauthorized access, and improve reliability.</li>
            <li>To send essential service messages (security alerts, recovery codes, receipts).</li>
          </ul>
        </Section>

        <Section icon={Lock} title="4. How Your Documents Are Protected">
          <ul className="list-disc pl-5 space-y-1">
            <li>Files are uploaded over HTTPS to private cloud storage that is not publicly listable.</li>
            <li>Access to your files is gated by per-user database rules (row-level security) so only your authenticated account can read them.</li>
            <li>The vault is locked behind multi-factor security (you must register several factors and pass at least two to unlock).</li>
            <li>The app auto-locks after a short period of inactivity (configurable up to a maximum of 2 minutes).</li>
            <li>Deleting a document requires a reason and security re-verification to prevent accidental or hostile deletion.</li>
            <li>Passwords and PINs are stored as one-way hashes; the app cannot show them back to you.</li>
          </ul>
          <p className="text-xs text-muted-foreground pt-2">
            No internet service can guarantee perfect security. You are responsible for keeping your password, PIN, recovery codes, and device safe.
          </p>
        </Section>

        <Section icon={Globe} title="5. Third-Party Services">
          <p>DocLocker relies on a small number of trusted providers to operate:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Cloud backend &amp; storage</strong> — hosts your account, database rows, and document files.</li>
            <li><strong>Google Sign-In</strong> (optional) — only if you choose to sign in with Google.</li>
            <li><strong>AI document cleanup</strong> — when you use the scanner, the captured image may be sent to an AI service to enhance edges, contrast, and remove glare. The cleaned image is returned to your device and saved to your vault; it is not used to train public models by us.</li>
            <li><strong>Payment processing</strong> — handled through a manual verification flow you control; we never store full card numbers.</li>
          </ul>
        </Section>

        <Section icon={UserCheck} title="6. Your Rights & Choices">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Access &amp; download.</strong> You can view and download any document from your drawers at any time.</li>
            <li><strong>Edit &amp; delete.</strong> You can rename, edit (where supported), or delete documents and drawers.</li>
            <li><strong>Delete your account.</strong> You may request full account and data deletion by contacting us at the address below.</li>
            <li><strong>Language.</strong> The app is available in 12 languages and can always be restored to English from the language selector.</li>
            <li><strong>Withdraw consent.</strong> You can stop using the app at any time; uninstalling and deleting your account removes your stored data.</li>
          </ul>
        </Section>

        <Section icon={AlertTriangle} title="7. Data Retention">
          <p>
            Your documents and account data are retained for as long as your
            account is active. If your subscription expires, your drawers are
            frozen (not deleted) so you can renew without losing data. If you
            ask us to delete your account, your files and personal data are
            permanently removed from active storage within 30 days, except where
            we are required by law to keep limited records.
          </p>
        </Section>

        <Section icon={Shield} title="8. Children's Privacy">
          <p>
            DocLocker is intended for users aged 13 and over (or the minimum age
            of digital consent in your country). We do not knowingly collect
            personal data from younger children. If you believe a child has
            created an account, please contact us so we can remove it.
          </p>
        </Section>

        <Section icon={Globe} title="9. International Use">
          <p>
            DocLocker is available worldwide and is translated into 12 languages.
            By using the app you understand that your data may be processed in
            countries other than your own, including in regions where data
            protection laws may differ. We apply the same security and access
            controls regardless of where you sign in from.
          </p>
        </Section>

        <Section icon={FileText} title="10. Changes to This Policy">
          <p>
            We may update this policy as the app evolves. When we make material
            changes we will update the "Last updated" date at the top of the
            page and, where appropriate, notify you inside the app. Continued
            use of DocLocker after a change means you accept the updated policy.
          </p>
        </Section>

        <Section icon={Mail} title="11. Contact Us">
          <p>
            Questions, complaints, or data-deletion requests? Reach the
            DocLocker team at:
          </p>
          <p className="font-medium">
            <a href="mailto:ndamson8@gmail.com" className="text-primary underline">
              ndamson8@gmail.com
            </a>
          </p>
          <p className="text-xs text-muted-foreground">
            Web:{" "}
            <a
              href="https://scanstore.ndamwesigaapp.store/privacy"
              className="text-primary underline"
            >
              scanstore.ndamwesigaapp.store/privacy
            </a>
          </p>
        </Section>

        <footer className="text-center text-xs text-muted-foreground pt-4 pb-8">
          © {new Date().getFullYear()} DocLocker. All rights reserved.
        </footer>
      </main>
    </div>
  );
}
