/* Quiet Atlas: cloud-white civic cartography, cobalt wayfinding, moss confirmation, and sand geography. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileCheck2,
  Globe2,
  LockKeyhole,
  MapPin,
  Menu,
  RadioTower,
  ShieldCheck,
  Users,
  Wifi,
  X,
} from 'lucide-react';

const features = [
  { icon: RadioTower, label: 'Live visibility', title: 'A single source of truth', description: 'See operational progress across every LGA, ward, and polling unit from one calm, decision-ready view.' },
  { icon: FileCheck2, label: 'Evidence first', title: 'Every result carries context', description: 'Capture result sheets, location data, submission history, and review actions together.' },
  { icon: ShieldCheck, label: 'Controlled access', title: 'Work stays in the right hands', description: 'Role-aware workflows give agents, officers, coordinators, observers, and administrators clear responsibilities.' },
  { icon: Wifi, label: 'Resilient by design', title: 'Stay operational in the field', description: 'Offline-aware submission and synchronization maintain continuity where networks cannot.' },
  { icon: BarChart3, label: 'Actionable signals', title: 'Turn attention into action', description: 'Surface pending reviews, disputes, anomalies, and collation status before they become blind spots.' },
  { icon: LockKeyhole, label: 'Accountable by default', title: 'A visible audit trail', description: 'Every sensitive action is attributable, time-stamped, and reviewable by authorized teams.' },
];

const metrics = [
  { value: '27', label: 'LGAs represented' },
  { value: '287', label: 'Wards mapped' },
  { value: '4,522', label: 'Polling units configured' },
  { value: '4', label: 'Active election contests' },
];

const lgas = [
  'Auyo', 'Babura', 'Biriniwa', 'Birnin Kudu', 'Buji', 'Dutse', 'Gagarawa', 'Garki',
  'Gumel', 'Guri', 'Gwaram', 'Gwiwa', 'Hadejia', 'Jahun', 'Kafin Hausa', 'Kaugama',
  'Kazaure', 'Kiri Kasama', 'Kiyawa', 'Maigatari', 'Malam Madori', 'Miga', 'Ringim',
  'Roni', 'Sule Tankarkar', 'Taura', 'Yankwashi'
];

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-3" aria-label="JISEMS home">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-primary-800 text-white shadow-md shadow-emerald-900/20 ring-1 ring-emerald-500/25"><ShieldCheck className="h-5 w-5" /></span>
      <span>
        <span className="block font-display text-2xl font-semibold leading-none tracking-tight text-primary-800">JISEMS</span>
        <span className="mt-1 block text-[.56rem] font-extrabold uppercase tracking-[.16em] text-emerald-800">Jigawa State Election Monitor</span>
      </span>
    </Link>
  );
}

function MapLine() {
  return <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-50" viewBox="0 0 600 420" fill="none"><path d="M-10 98C120 24 168 210 294 120S468 8 617 94" stroke="#31598a" strokeWidth="1" strokeDasharray="5 9"/><path d="M-30 280C96 336 160 160 276 250s193 53 357-9" stroke="#3d7468" strokeWidth="1" strokeDasharray="3 10"/><path d="M59 -19c33 112 136 93 176 173 44 86-31 135-95 269" stroke="#b78639" strokeWidth="1" strokeDasharray="2 9"/></svg>;
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const onScroll = () => setScrolled(window.scrollY > 18); window.addEventListener('scroll', onScroll, { passive: true }); return () => window.removeEventListener('scroll', onScroll); }, []);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-dark-bg text-text-primary">
      <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled ? 'border-b border-dark-border bg-dark-surface/90 shadow-sm backdrop-blur-xl' : 'bg-dark-bg/60 backdrop-blur-sm'}`}>
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <Logo />
          <nav className="hidden items-center gap-8 md:flex" aria-label="Primary navigation">
            <a href="#features" className="text-sm font-semibold text-text-secondary transition hover:text-primary-700">Platform</a><a href="#coverage" className="text-sm font-semibold text-text-secondary transition hover:text-primary-700">Coverage</a><a href="#about" className="text-sm font-semibold text-text-secondary transition hover:text-primary-700">Why JISEMS</a>
            <Link to="/situation-room" className="inline-flex items-center gap-2 text-sm font-bold text-primary-700 transition hover:text-primary-500"><RadioTower className="h-4 w-4" /> Situation Room</Link>
          </nav>
          <div className="hidden items-center gap-3 md:flex"><Link to="/login" className="rounded-xl px-4 py-2.5 text-sm font-bold text-text-secondary transition hover:bg-primary-50 hover:text-primary-700">Sign in</Link><Link to="/register" className="btn-primary py-2.5">Join the network <ArrowRight className="h-4 w-4" /></Link></div>
          <button type="button" className="rounded-xl border border-dark-border bg-white/80 p-2.5 text-primary-700 md:hidden" onClick={() => setMenuOpen((value) => !value)} aria-label={menuOpen ? 'Close menu' : 'Open menu'}>{menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
        {menuOpen && <div className="border-t border-dark-border bg-dark-surface/95 px-5 py-5 shadow-xl backdrop-blur-xl md:hidden"><div className="mx-auto flex max-w-7xl flex-col gap-1"><a href="#features" onClick={closeMenu} className="rounded-xl px-4 py-3 font-semibold text-text-secondary hover:bg-primary-50">Platform</a><a href="#coverage" onClick={closeMenu} className="rounded-xl px-4 py-3 font-semibold text-text-secondary hover:bg-primary-50">Coverage</a><a href="#about" onClick={closeMenu} className="rounded-xl px-4 py-3 font-semibold text-text-secondary hover:bg-primary-50">Why JISEMS</a><Link to="/situation-room" onClick={closeMenu} className="rounded-xl px-4 py-3 font-bold text-primary-700">Open Situation Room</Link><div className="mt-2 grid grid-cols-2 gap-2 border-t border-dark-border pt-4"><Link to="/login" onClick={closeMenu} className="btn-outline">Sign in</Link><Link to="/register" onClick={closeMenu} className="btn-primary">Join network</Link></div></div></div>}
      </header>

      <main>
        <section className="relative isolate overflow-hidden pb-20 pt-36 sm:pb-28 sm:pt-44">
          <div className="atlas-grid absolute inset-0 -z-20 opacity-70"/><MapLine/><div className="absolute -right-24 top-16 -z-10 h-80 w-80 rounded-full bg-primary-100/50 blur-3xl"/><div className="absolute -left-20 bottom-0 -z-10 h-72 w-72 rounded-full bg-accent-100/50 blur-3xl"/>
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1fr_.92fr] lg:gap-20">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65 }}>
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-[.64rem] font-extrabold uppercase tracking-[.15em] text-emerald-800 shadow-sm"><span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"/> Election operations, made visible</div>
              <h1 className="max-w-3xl font-display text-5xl font-semibold leading-[.98] tracking-[-.055em] text-text-primary sm:text-6xl lg:text-[5.2rem]">Make every vote in Jigawa State <span className="text-emerald-700 font-serif">easy to verify.</span></h1>
              <p className="mt-7 max-w-xl text-lg leading-8 text-text-secondary sm:text-xl">JISEMS is the official operational platform for transparent election monitoring across Jigawa State—connecting field evidence, review workflows, collation, and public visibility.</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link to="/situation-room" className="btn-jigawa px-6 py-3.5">Explore the Situation Room <ArrowRight className="h-4 w-4" /></Link><Link to="/register" className="btn-outline px-6 py-3.5">Register as an agent</Link></div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-text-muted"><span className="inline-flex items-center gap-2 text-emerald-800 font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-600"/> 4,522 Verified Polling Units</span><span className="inline-flex items-center gap-2 text-primary-800 font-semibold"><LockKeyhole className="h-4 w-4 text-primary-600"/> EC8A Cryptographic Audit</span><span className="inline-flex items-center gap-2 text-amber-800 font-semibold"><Globe2 className="h-4 w-4 text-amber-600"/> All 27 Local Governments</span></div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, delay: .12 }} className="relative">
              <div className="absolute -inset-5 rounded-[2rem] bg-emerald-100/40 blur-2xl"/><div className="relative overflow-hidden rounded-[1.75rem] border border-dark-border bg-dark-surface shadow-2xl shadow-emerald-950/10"><div className="flex items-center justify-between border-b border-dark-border px-5 py-4"><div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-status-error/70"/><span className="h-2.5 w-2.5 rounded-full bg-status-warning/70"/><span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70"/></div><span className="font-mono text-[.6rem] uppercase tracking-[.15em] text-text-muted">Operations / live</span></div><div className="p-5 sm:p-7"><div className="flex items-start justify-between"><div><p className="eyebrow">State overview</p><h2 className="mt-2 font-display text-2xl font-semibold">Election readiness</h2></div><span className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-800 shadow-sm"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"/> Live Verified</span></div><div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">{metrics.map((metric) => <div key={metric.label} className="rounded-2xl border border-dark-border bg-dark-surface-2/60 p-3"><p className="font-mono text-2xl font-bold text-text-primary">{metric.value}</p><p className="mt-1 text-[.62rem] leading-4 text-text-muted">{metric.label}</p></div>)}</div><div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4"><div className="flex items-center justify-between text-xs"><span className="font-bold text-text-secondary">Reporting coverage</span><span className="font-mono font-bold text-emerald-700">68.4%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100"><div className="h-full w-[68.4%] rounded-full bg-gradient-to-r from-emerald-600 to-primary-600"/></div><div className="mt-4 grid grid-cols-3 gap-3 text-xs"><span><b className="block text-text-primary">598</b><span className="text-text-muted">submitted</span></span><span><b className="block text-text-primary">194</b><span className="text-text-muted">in review</span></span><span><b className="block text-text-primary">81</b><span className="text-text-muted">attention</span></span></div></div></div></div>
            </motion.div>
          </div>
        </section>

        <section id="features" className="border-y border-dark-border bg-dark-surface/65 py-24 sm:py-28"><div className="mx-auto max-w-7xl px-5 sm:px-8"><div className="max-w-2xl"><p className="eyebrow">The platform</p><h2 className="section-heading mt-3">Clarity at every layer of the operation.</h2><p className="mt-5 text-lg leading-8 text-text-secondary">A serious monitoring system should reduce uncertainty, not add another dashboard to manage. JISEMS brings the critical path into focus.</p></div><div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map((feature, index) => <motion.article key={feature.title} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} transition={{ delay: index * .04 }} className="group rounded-2xl border border-dark-border bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-primary-300 hover:shadow-lg hover:shadow-primary-900/5"><div className="grid h-11 w-11 place-items-center rounded-xl bg-primary-50 text-primary-600 transition group-hover:bg-accent-50 group-hover:text-accent-600"><feature.icon className="h-5 w-5"/></div><p className="mt-6 text-[.64rem] font-extrabold uppercase tracking-[.15em] text-primary-600">{feature.label}</p><h3 className="mt-2 font-display text-xl font-semibold text-text-primary">{feature.title}</h3><p className="mt-3 text-sm leading-6 text-text-secondary">{feature.description}</p></motion.article>)}</div></div></section>

        <section id="coverage" className="py-24 sm:py-28"><div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-[.86fr_1.14fr] lg:items-center"><div><p className="eyebrow">Coverage</p><h2 className="section-heading mt-3">Built around the geography teams actually work in.</h2><p className="mt-5 text-lg leading-8 text-text-secondary">From state coordination to the polling unit, the platform keeps geography, responsibility, and progress connected.</p><div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">{metrics.map((metric) => <div key={metric.label} className="surface-elevated p-4"><p className="font-mono text-2xl font-bold text-primary-600">{metric.value}</p><p className="mt-1 text-xs leading-5 text-text-muted">{metric.label}</p></div>)}</div></div><div className="surface-elevated atlas-grid relative overflow-hidden p-6 sm:p-8"><MapLine/><div className="relative flex items-center justify-between border-b border-dark-border pb-5"><div><p className="eyebrow">Jigawa State</p><h3 className="mt-2 font-display text-2xl font-semibold">Operational map</h3></div><MapPin className="h-6 w-6 text-status-warning"/></div><div className="relative mt-6 flex flex-wrap gap-2">{lgas.map((lga, index) => <span key={lga} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${index === 5 ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold shadow-sm ring-2 ring-emerald-400/30' : 'border-dark-border bg-white/70 text-text-secondary'}`}>{lga}</span>)}</div><div className="relative mt-8 flex items-start gap-4 rounded-2xl border border-primary-200 bg-primary-50/60 p-4"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-100 text-primary-600"><Users className="h-4 w-4"/></div><div><p className="text-sm font-bold text-text-primary">A shared operating picture</p><p className="mt-1 text-xs leading-5 text-text-muted">Agents submit. Officers review. Coordinators collate. Administrators keep the system accountable.</p></div></div></div></div></section>

        <section id="about" className="border-t border-dark-border bg-primary-800 py-24 text-white sm:py-28"><div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[1fr_.86fr] lg:items-end"><div><p className="text-[.67rem] font-extrabold uppercase tracking-[.19em] text-primary-200">Why JISEMS</p><h2 className="mt-3 max-w-xl font-display text-4xl font-semibold leading-tight">Technology that earns trust by making its work visible.</h2></div><div><p className="text-lg leading-8 text-primary-100">JISEMS is designed for the moments where accuracy, speed, and accountability have to coexist. Its value is not more noise—it is a clearer chain from field action to public confidence.</p><Link to="/situation-room" className="mt-7 inline-flex items-center gap-2 border-b border-primary-200 pb-1 text-sm font-bold text-white transition hover:text-primary-100">View the public Situation Room <ArrowRight className="h-4 w-4"/></Link></div></div></section>
      </main>
      <footer className="bg-dark-surface py-10"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8"><Logo/><p>Jigawa State Election Monitor · Clear work. Accountable outcomes.</p></div></footer>
    </div>
  );
}
