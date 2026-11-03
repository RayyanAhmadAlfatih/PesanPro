import Link from "next/link";
import { ArrowLeft, ShieldCheck, Scale } from "lucide-react";

export const metadata = {
    title: "Terms of Service | PesanPro",
    description: "Terms of Service for the PesanPro WhatsApp Gateway service: usage guidelines, security requirements, and acceptable use policy.",
    openGraph: {
        title: "Terms of Service | PesanPro",
        description: "Terms of Service for the PesanPro WhatsApp Gateway service.",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Terms of Service | PesanPro",
        description: "Terms of Service for the PesanPro WhatsApp Gateway service.",
    },
};

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-background relative overflow-hidden py-24 selection:bg-primary/30 selection:text-primary-foreground">
            {/* Ambient background glows */}
            <div className="fixed top-0 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-emerald-500/5 dark:bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
            <div className="fixed bottom-0 right-1/4 translate-x-1/2 translate-y-1/2 w-[30rem] h-[30rem] bg-blue-500/5 dark:bg-blue-600/10 rounded-full blur-[100px] pointer-events-none -z-10" />

            <div className="container max-w-4xl px-4 mx-auto relative z-10">

                <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-8 transition-colors group">
                    <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    Back to Home
                </Link>

                <div className="glass-panel p-8 md:p-12 rounded-3xl shadow-xl shadow-black/5 dark:shadow-black/20 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 bg-primary/10 rounded-2xl">
                            <Scale className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">Terms of Service</h1>
                            <p className="text-muted-foreground mt-2">Last updated: {new Date().toLocaleDateString()}</p>
                        </div>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary/80 prose-p:leading-relaxed">

                        <p className="lead text-lg text-muted-foreground mb-8">
                            Welcome to PesanPro. By accessing or using our WhatsApp Gateway platform, you agree to be bound by these Terms. If you do not agree, please do not use the service.
                        </p>

                        <h2 className="flex items-center gap-2 mt-8 text-2xl border-b pb-2">
                            <ShieldCheck className="h-6 w-6 text-emerald-500" />
                            1. The Service
                        </h2>
                        <p>
                            PesanPro is a <strong>hosted WhatsApp Gateway service</strong>. The application runs on infrastructure operated by the service provider, and you access it through the website and dashboard. Your account, plan, and usage records are stored on that infrastructure so the service can operate. Message content exchanged through the gateway is not stored by PesanPro — only delivery records such as status and timestamps.
                        </p>
                        <ul>
                            <li><strong>Your responsibility:</strong> keep your account credentials private, use strong passwords, and revoke API keys or integration tokens you no longer use.</li>
                            <li><strong>Account integrity:</strong> monitor the devices connected to your account. If you suspect unauthorized access, change your password immediately and unlink the device from your WhatsApp app.</li>
                            <li><strong>Service availability:</strong> the service depends on hosting infrastructure and on WhatsApp&apos;s systems; planned maintenance and outages may occur.</li>
                        </ul>

                        <h2 className="mt-8 text-2xl border-b pb-2">2. Acceptable Use Policy</h2>
                        <p>
                            When utilizing PesanPro&apos;s API, auto-replies, and broadcasting capabilities, you agree to abide by WhatsApp&apos;s official Terms of Service and Anti-Spam policies. You agree not to:
                        </p>
                        <ul>
                            <li>Send unsolicited &quot;spam&quot; messages or bulk promotional campaigns to users who have not explicitly opted-in.</li>
                            <li>Use the platform to distribute malicious software, phishing links, or illegal content.</li>
                            <li>Attempt to reverse-engineer the core API or overload the service with excessive requests.</li>
                            <li>Use the service in ways that violate applicable law, including rules on electronic messages and personal data.</li>
                        </ul>

                        <h2 className="mt-8 text-2xl border-b pb-2">3. Plans, Payment, and Fair Use</h2>
                        <ul>
                            <li>The service is offered through paid plans with defined limits (devices, messages, broadcast volume, storage). Your current plan and its limits are always visible in the dashboard.</li>
                            <li>Payments are made by manual bank transfer followed by administrator verification; a plan becomes active after the payment is approved.</li>
                            <li>Usage that exceeds a plan&apos;s limits is rejected cleanly — for example, uploads are blocked while storage is over quota — without deleting your existing data.</li>
                        </ul>

                        <h2 className="mt-8 text-2xl border-b pb-2">4. Disclaimers and Limitations</h2>
                        <p>
                            PesanPro is provided &quot;as is&quot; and without warranties of any kind. We utilize third-party libraries (such as Baileys) to connect to WhatsApp web protocols. Changes to WhatsApp&apos;s internal systems may occasionally disrupt service. We are not liable for any account suspensions or bans imposed by WhatsApp as a result of your usage.
                        </p>

                        <h2 className="mt-8 text-2xl border-b pb-2">5. Attribution</h2>
                        <p>
                            PesanPro acknowledges <a href="https://github.com/mrifqidaffaaditya/WA-AKG">WA-AKG</a>, the MIT-licensed open-source project whose work this product builds on, with appreciation to its author. PesanPro is a separate product and is not affiliated with or endorsed by WA-AKG. The full MIT license notice is included in the project&apos;s LICENSE file.
                        </p>

                        <div className="mt-12 p-6 bg-primary/5 rounded-2xl border border-primary/10">
                            <p className="font-semibold mb-2">Have questions about these terms?</p>
                            <p className="text-sm text-muted-foreground mb-0">Please contact the service administrator for further clarification.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
