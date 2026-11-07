import React, { useEffect } from 'react';
import { Nav } from '../landing/sections/Nav';
import { Footer } from '../landing/sections/Footer';
import { Shield, Lock, Eye, Trash2, Mail, Server, Database, MessageSquare } from 'lucide-react';
import '../landing/index.css';

interface PrivacyPageProps {
  onOpenAuth: () => void;
  onNavigateHome: () => void;
}

export const PrivacyPage: React.FC<PrivacyPageProps> = ({ onOpenAuth, onNavigateHome }) => {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = 'Privacy Policy — Lunao';
  }, []);

  return (
    <div className="landing-root min-h-screen bg-off-white text-ink flex flex-col font-sans selection:bg-accent/15 selection:text-ink">
      <Nav onOpenDashboard={onOpenAuth} />

      <main className="flex-1 pt-28 md:pt-36 pb-20">
        <div className="landing-container max-w-[820px] mx-auto px-5 sm:px-8">
          
          {/* Header */}
          <div className="border-b border-border-main pb-8 mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-soft text-accent text-xs font-mono font-semibold tracking-wider uppercase mb-4">
              <Shield className="w-3.5 h-3.5" />
              <span>Legal Documentation</span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-ink font-normal tracking-tight leading-tight mb-3">
              Privacy Policy
            </h1>
            <p className="font-sans text-sm text-ink-secondary">
              Effective Date: November 5, 2026 &bull; Last Updated: November 2026
            </p>
          </div>

          {/* Core Notice Callout */}
          <div className="p-5 sm:p-6 rounded-xl bg-white border border-accent/25 shadow-xs mb-10 space-y-2">
            <div className="flex items-center gap-2 text-accent font-semibold text-sm">
              <Lock className="w-4 h-4" />
              <span>Google API User Data Commitment</span>
            </div>
            <p className="text-sm text-ink leading-relaxed font-medium">
              We only use Google user data to sign users in and don&rsquo;t sell it. Lunao never uses, shares, or transfers your Google user profile data for advertising, data brokering, or machine-learning model training.
            </p>
          </div>

          {/* Policy Body */}
          <div className="space-y-10 text-sm sm:text-base text-ink-secondary leading-relaxed">
            
            <section className="space-y-3">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">1. Overview &amp; Product Purpose</h2>
              <p>
                Lunao (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) provides an automated B2B local marketing and client acquisition platform. Our software allows agencies and business professionals to discover local businesses, generate customized preview websites, manage outreach via SMS and email, and review incoming booking requests.
              </p>
              <p>
                This Privacy Policy explains what personal and operational data we collect, how that information is used, who it is shared with, how it is secured, and your rights regarding your data.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">2. Information We Collect</h2>
              <p>We collect only the information necessary to provide, secure, and operate the Lunao service:</p>

              <div className="grid grid-cols-1 gap-3.5 pt-1">
                <div className="p-4 rounded-xl bg-white border border-border-main space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-ink text-sm">
                    <Lock className="w-4 h-4 text-accent" />
                    <span>Google Sign-In &amp; Authentication</span>
                  </div>
                  <p className="text-xs sm:text-sm text-ink-secondary">
                    When you authenticate via Google Sign-In, we receive your Google ID, primary email address, full name, and avatar picture. We use this information solely to verify your identity, create your user session, and maintain your account profile.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-border-main space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-ink text-sm">
                    <Database className="w-4 h-4 text-emerald-600" />
                    <span>Account &amp; Campaign Data</span>
                  </div>
                  <p className="text-xs sm:text-sm text-ink-secondary">
                    Workspace settings, subscription tier, credit balances, outreach campaign configurations, customized template content, and prospect contact records you import or create are stored securely in our database.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-border-main space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-ink text-sm">
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    <span>Outreach Communications</span>
                  </div>
                  <p className="text-xs sm:text-sm text-ink-secondary">
                    SMS messages sent through connected carrier lines, delivery statuses, two-way conversational responses, and email outreach logs (recipient addresses and message bodies) are processed to provide campaign delivery tracking.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-border-main space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-ink text-sm">
                    <Server className="w-4 h-4 text-amber-600" />
                    <span>Technical &amp; Log Information</span>
                  </div>
                  <p className="text-xs sm:text-sm text-ink-secondary">
                    When you interact with Lunao or our hosted client sites, edge servers automatically log basic HTTP metadata, including IP address, browser user-agent, operating system, and request timestamps to prevent abuse and verify system health.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">3. How We Use Your Data</h2>
              <p>We process your data strictly to fulfill our contractual commitments and legitimate business purposes:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Authenticating user access and securing workspace sessions.</li>
                <li>Compiling, personalizing, and hosting live preview websites for local prospects.</li>
                <li>Executing SMS outreach via registered 10DLC carrier routes and delivering outbound emails.</li>
                <li>Recording incoming booking requests and notifying business owners through their mobile PWA.</li>
                <li>Monitoring system availability, verifying edge network health (HTTP 200 checks), and preventing fraudulent activity.</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">4. Third-Party Service Providers &amp; Subprocessors</h2>
              <p>
                We do not sell, rent, or trade your personal data. We disclose information only to vetted third-party service providers who assist us in operating our platform, subject to strict confidentiality and security obligations:
              </p>
              <div className="border border-border-main rounded-xl overflow-hidden bg-white text-xs sm:text-sm">
                <div className="grid grid-cols-12 bg-off-white font-semibold text-ink p-3 border-b border-border-light font-mono text-xs uppercase tracking-wider">
                  <div className="col-span-4">Service Provider</div>
                  <div className="col-span-4">Role / Purpose</div>
                  <div className="col-span-4">Data Shared</div>
                </div>
                <div className="grid grid-cols-12 p-3 border-b border-border-light/60 items-center">
                  <div className="col-span-4 font-semibold text-ink">Google Identity Services</div>
                  <div className="col-span-4 text-ink-secondary">OAuth authentication</div>
                  <div className="col-span-4 text-ink-secondary">Email, Name, Profile ID</div>
                </div>
                <div className="grid grid-cols-12 p-3 border-b border-border-light/60 items-center">
                  <div className="col-span-4 font-semibold text-ink">Supabase, Inc.</div>
                  <div className="col-span-4 text-ink-secondary">Database &amp; user records</div>
                  <div className="col-span-4 text-ink-secondary">Account data, site configs</div>
                </div>
                <div className="grid grid-cols-12 p-3 border-b border-border-light/60 items-center">
                  <div className="col-span-4 font-semibold text-ink">Telnyx LLC</div>
                  <div className="col-span-4 text-ink-secondary">Carrier SMS delivery &amp; 10DLC</div>
                  <div className="col-span-4 text-ink-secondary">Phone numbers, SMS content</div>
                </div>
                <div className="grid grid-cols-12 p-3 border-b border-border-light/60 items-center">
                  <div className="col-span-4 font-semibold text-ink">Resend, Inc.</div>
                  <div className="col-span-4 text-ink-secondary">Transactional email routing</div>
                  <div className="col-span-4 text-ink-secondary">Recipient email, message text</div>
                </div>
                <div className="grid grid-cols-12 p-3 border-b border-border-light/60 items-center">
                  <div className="col-span-4 font-semibold text-ink">Cloudflare, Inc.</div>
                  <div className="col-span-4 text-ink-secondary">Edge hosting &amp; CDN routing</div>
                  <div className="col-span-4 text-ink-secondary">IP address, request logs</div>
                </div>
                <div className="grid grid-cols-12 p-3 items-center">
                  <div className="col-span-4 font-semibold text-ink">Amazon Web Services (AWS)</div>
                  <div className="col-span-4 text-ink-secondary">EC2 backend infrastructure</div>
                  <div className="col-span-4 text-ink-secondary">Application execution logs</div>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">5. Data Retention &amp; Deletion</h2>
              <p>
                We retain your account profile, campaign history, and saved sites for as long as your workspace account is active or as necessary to provide you services. Operational logs and delivery metrics are retained for up to 90 days for network diagnostics, security monitoring, and carrier deliverability records, after which they are systematically purged.
              </p>
              <p>
                You may request complete deletion of your account, personal data, and all associated prospect records at any time. To request deletion, email us at <a href="mailto:lunaoxx77@gmail.com" className="text-accent underline font-medium">lunaoxx77@gmail.com</a>. Requests are fulfilled within 30 days upon identity verification.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">6. Data Security</h2>
              <p>
                We maintain appropriate organizational and technical safeguards to protect your personal data against unauthorized access, loss, alteration, or disclosure. All web traffic is strictly encrypted using modern Transport Layer Security (TLS/HTTPS). Database connections require authenticated tokens and role-based row-level security (RLS).
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">7. Contact Information</h2>
              <p>
                If you have questions, concerns, or requests regarding this Privacy Policy or our data handling practices, please contact our data protection team:
              </p>
              <div className="p-4 rounded-xl bg-white border border-border-main space-y-1 text-sm font-sans">
                <p className="font-bold text-ink">Lunao Legal &amp; Privacy</p>
                <p className="text-ink-secondary">Email: <a href="mailto:lunaoxx77@gmail.com" className="text-accent underline font-semibold">lunaoxx77@gmail.com</a></p>
                <p className="text-ink-secondary">Website: <a href="https://lunao.org" className="text-accent underline">https://lunao.org</a></p>
              </div>
            </section>

          </div>
        </div>
      </main>

      <Footer onOpenDashboard={onOpenAuth} />
    </div>
  );
};

export default PrivacyPage;
