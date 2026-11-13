import Link from "next/link";
import { ArrowLeft, Lock, Shield } from "lucide-react";

export const metadata = {
    title: "Privacy Policy | PesanPro",
    description: "Privacy Policy for the PesanPro WhatsApp Gateway service: what data we process, why, and how it is protected.",
    openGraph: {
        title: "Privacy Policy | PesanPro",
        description: "Privacy Policy for the PesanPro WhatsApp Gateway service.",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Privacy Policy | PesanPro",
        description: "Privacy Policy for the PesanPro WhatsApp Gateway service.",
    },
};

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-background relative overflow-hidden py-24 selection:bg-primary/30 selection:text-primary-foreground">
            {/* Ambient background glows */}
            <div className="fixed top-0 right-1/4 translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
            <div className="fixed bottom-0 left-1/4 -translate-x-1/2 translate-y-1/2 w-[30rem] h-[30rem] bg-emerald-500/5 dark:bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none -z-10" />

            <div className="container max-w-4xl px-4 mx-auto relative z-10">

                <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-8 transition-colors group">
                    <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    Back to Home
                </Link>

                <div className="glass-panel p-8 md:p-12 rounded-3xl shadow-xl shadow-black/5 dark:shadow-black/20 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 bg-blue-500/10 rounded-2xl">
                            <Shield className="h-8 w-8 text-blue-500" />
                        </div>
                        <div>
                            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
                            <p className="text-muted-foreground mt-2">Effective Date: {new Date().toLocaleDateString()}</p>
                        </div>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary/80 prose-p:leading-relaxed">

                        <p className="lead text-lg text-muted-foreground mb-8">
                            At PesanPro, we believe that your data is your property. This Privacy Policy explains what information the PesanPro service processes, why it is needed, and the boundaries we keep.
                        </p>

                        <h2 className="flex items-center gap-2 mt-8 text-2xl border-b pb-2">
                            <Lock className="h-6 w-6 text-blue-500" />
                            1. How PesanPro Runs
                        </h2>
                        <p>
                            PesanPro is a <strong>centralized online service</strong>. The application and its database run on servers operated by the service provider — you use it through the website and dashboard, without installing anything on your own infrastructure. This means some data is stored on our servers so the service can function: manage your account, deliver your WhatsApp messages, and keep records you can review in the dashboard.
                        </p>

                        <h2 className="mt-8 text-2xl border-b pb-2">2. Data We Process</h2>
                        <ul>
                            <li><strong>Account data:</strong> your name, email address, and password — passwords are stored only as secure hashes, never in readable form.</li>
                            <li><strong>Billing data:</strong> your plan, billing period, payment reference, and the transfer proof you upload so an administrator can verify your payment. Bank account details you provide are used solely for payment verification.</li>
                            <li><strong>Device metadata:</strong> the name of each WhatsApp device you connect, the linked phone number, and its connection status.</li>
                            <li><strong>Delivery metadata:</strong> for each message, the recipient, delivery status (sent, delivered, read), timestamps, and error codes when something fails. <strong>PesanPro stores the content of your WhatsApp messages for up to 30 days for delivery and debugging, then deletes it automatically.</strong></li>
                            <li><strong>Media files:</strong> images, documents, audio, or video you upload to send through the gateway. Files are stored with private access permissions and are deleted automatically after the retention period shown in your plan documentation.</li>
                            <li><strong>Automation settings:</strong> auto-reply rules, schedules, suppression lists, API keys (stored only as hashes), and webhook endpoints you configure.</li>
                        </ul>

                        <h2 className="mt-8 text-2xl border-b pb-2">3. What We Do Not Do</h2>
                        <ul>
                            <li>We do not sell your data, and we do not share it with advertisers.</li>
                            <li>We do not read your WhatsApp message content for any purpose other than delivery and debugging. It is stored for up to 30 days and then deleted automatically.</li>
                            <li>We do not add third-party advertising or analytics trackers to the service.</li>
                        </ul>

                        <h2 className="mt-8 text-2xl border-b pb-2">4. Third Parties Involved</h2>
                        <p>
                            Using PesanPro means messages are exchanged through <strong>WhatsApp, operated by Meta</strong> — your use of WhatsApp remains subject to Meta&apos;s own terms and privacy policy. Our service also runs on third-party hosting infrastructure operated on behalf of the service provider. We do not otherwise forward your data to parties outside the service.
                        </p>

                        <h2 className="mt-8 text-2xl border-b pb-2">5. Security and Your Controls</h2>
                        <ul>
                            <li>Access to the service is protected by session authentication, per-device ownership checks, and optional API keys with limited permissions.</li>
                            <li>You can revoke API keys and integration tokens yourself at any time from the dashboard; revocation takes effect immediately.</li>
                            <li>You can disconnect a WhatsApp device from the dashboard at any time; disconnection removes the linked session.</li>
                            <li>Requests to review or delete your account data can be addressed to the service administrator.</li>
                        </ul>

                        <div className="mt-12 p-6 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                            <p className="font-semibold mb-2">Need Further Details?</p>
                            <p className="text-sm text-muted-foreground mb-0">If you have specific questions about data handling, please contact the PesanPro service administrator or return to the <Link href="/">PesanPro home page</Link>.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
