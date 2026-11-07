import React, { useEffect } from 'react';
import { Nav } from '../landing/sections/Nav';
import { Footer } from '../landing/sections/Footer';
import { FileText, CheckCircle, AlertTriangle, ShieldCheck, Mail, Scale } from 'lucide-react';
import '../landing/index.css';

interface TermsPageProps {
  onOpenAuth: () => void;
  onNavigateHome: () => void;
}

export const TermsPage: React.FC<TermsPageProps> = ({ onOpenAuth, onNavigateHome }) => {
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = 'Terms of Service — Lunao';
  }, []);

  return (
    <div className="landing-root min-h-screen bg-off-white text-ink flex flex-col font-sans selection:bg-accent/15 selection:text-ink">
      <Nav onOpenDashboard={onOpenAuth} />

      <main className="flex-1 pt-28 md:pt-36 pb-20">
        <div className="landing-container max-w-[820px] mx-auto px-5 sm:px-8">
          
          {/* Header */}
          <div className="border-b border-border-main pb-8 mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-soft text-accent text-xs font-mono font-semibold tracking-wider uppercase mb-4">
              <Scale className="w-3.5 h-3.5" />
              <span>Legal Terms</span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-ink font-normal tracking-tight leading-tight mb-3">
              Terms of Service
            </h1>
            <p className="font-sans text-sm text-ink-secondary">
              Effective Date: November 5, 2026 &bull; Last Updated: November 2026
            </p>
          </div>

          {/* Terms Content */}
          <div className="space-y-10 text-sm sm:text-base text-ink-secondary leading-relaxed">
            
            <section className="space-y-3">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">1. Agreement to Terms</h2>
              <p>
                These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Lunao&rsquo;s website, software, APIs, and associated services (collectively, the &ldquo;Service&rdquo;). By accessing, registering for, or using the Service, you agree to be legally bound by these Terms. If you do not agree to these Terms, you may not access or use Lunao.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">2. Description of the Service</h2>
              <p>
                Lunao provides an automated B2B local marketing platform designed for marketing agencies, freelancers, and sales teams. The Service enables users to discover public business listings, compile and host personalized preview websites on edge infrastructure, send outreach notifications via SMS and email, and review appointment requests captured via client landing pages.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">3. User Accounts &amp; Responsibilities</h2>
              <p>To use certain features of the Service, you must authenticate using a supported provider such as Google Sign-In:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>You must provide accurate, current, and complete registration information.</li>
                <li>You are solely responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</li>
                <li>You must notify us immediately at <a href="mailto:lunaoxx77@gmail.com" className="text-accent underline">lunaoxx77@gmail.com</a> of any unauthorized access or security breach regarding your account.</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">4. Acceptable Use Policy &amp; Outreach Compliance</h2>
              <p>
                You agree to use the Service in full compliance with all applicable federal, state, and international laws, including but not limited to the Telephone Consumer Protection Act (TCPA), the CAN-SPAM Act, carrier 10DLC regulations, and data privacy legislation.
              </p>
              <div className="p-4 rounded-xl bg-white border border-border-main space-y-2">
                <p className="font-semibold text-ink text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  <span>Prohibited Activities</span>
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-ink-secondary">
                  <li>Sending unsolicited spam, bulk robocalls, or unlawful marketing messages.</li>
                  <li>Using the platform to harass, defraud, impersonate, or mislead recipients.</li>
                  <li>Distributing malware, phishing links, or malicious code through preview sites.</li>
                  <li>Attempting to bypass access controls, reverse-engineer proprietary algorithms, or disrupt server infrastructure.</li>
                </ul>
              </div>
              <p>
                You are strictly responsible for obtaining all legally required consents, disclosures, and opt-in authorizations from recipients prior to transmitting SMS or email messages through the platform.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">5. Subscription Plans, Billing &amp; Credits</h2>
              <p>
                Certain features of Lunao require a paid subscription or consumption of platform credits. All fees are stated in U.S. Dollars and are billed in advance on a recurring monthly or annual basis. Subscriptions renew automatically unless cancelled prior to the end of the current billing cycle.
              </p>
              <p>
                Credits allocated to your plan expire according to the terms of your subscription tier. Unless required by applicable law, all fees and credit purchases are non-refundable.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">6. Service Provided &ldquo;As-Is&rdquo;</h2>
              <p>
                The Service, including all templates, AI generation tools, hosting infrastructure, and messaging bridges, is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; basis without warranties of any kind, whether express or implied.
              </p>
              <p>
                Lunao does not guarantee that the Service will be uninterrupted, error-free, or entirely secure, or that any outreach campaign will achieve specific response rates, conversion rates, or financial results. Carrier delivery rates for SMS and email are subject to third-party telecommunications networks and spam filtering outside our direct control.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">7. Limitation of Liability</h2>
              <p>
                To the fullest extent permitted by applicable law, in no event shall Lunao, its directors, employees, partners, or suppliers be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, revenue, or business reputation, arising from or related to your use of or inability to use the Service.
              </p>
              <p>
                In no event shall Lunao&rsquo;s aggregate liability for all claims related to the Service exceed the total amount paid by you to Lunao in the twelve (12) months preceding the event giving rise to liability.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">8. Termination &amp; Suspension</h2>
              <p>
                We reserve the right to suspend or terminate your access to the Service immediately, without prior notice or liability, if you breach these Terms, violate acceptable use guidelines, or engage in unlawful messaging practices. You may cancel your account at any time through your dashboard settings or by contacting <a href="mailto:lunaoxx77@gmail.com" className="text-accent underline">lunaoxx77@gmail.com</a>.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">9. Governing Law &amp; Changes to Terms</h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Lunao operates, without regard to its conflict of law principles.
              </p>
              <p>
                We may revise these Terms from time to time. When changes are made, we will update the &ldquo;Last Updated&rdquo; date at the top of this page. Your continued use of the Service after the effective date of revised Terms constitutes your acceptance of the changes.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-serif text-2xl text-ink font-normal tracking-tight">10. Contact Us</h2>
              <p>
                If you have any questions or feedback regarding these Terms of Service, please reach out to us:
              </p>
              <div className="p-4 rounded-xl bg-white border border-border-main space-y-1 text-sm font-sans">
                <p className="font-bold text-ink">Lunao Legal Operations</p>
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

export default TermsPage;
