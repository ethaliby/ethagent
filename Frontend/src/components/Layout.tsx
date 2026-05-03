import { Link, NavLink, Outlet } from "react-router-dom";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const NavItem = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `relative text-[11px] uppercase tracking-widest2 transition-colors duration-200 font-medium ${
        isActive ? "text-fg" : "text-muted hover:text-fg"
      }`
    }
    style={{ fontFamily: "JetBrains Mono, monospace" }}
  >
    {children}
  </NavLink>
);

function Logo() {
  return (
    <Link to="/app" className="group flex items-center gap-3">
      <span className="display text-2xl text-fg group-hover:accent-text transition-colors">
        Sirius
      </span>
      <span
        className="hidden md:inline text-[10px] uppercase tracking-widest2 text-muted2 border-l border-line2 pl-3"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        for agents
      </span>
    </Link>
  );
}

export function Layout() {
  return (
    <div className="relative min-h-screen flex flex-col z-10">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
          <Logo />
          <nav className="hidden md:flex items-center gap-8">
            <NavItem to="/explore">Explore</NavItem>
            <NavItem to="/verify">Verify</NavItem>
            <NavItem to="/agents/new">Create</NavItem>
          </nav>
          <ConnectButton chainStatus="icon" showBalance={false} accountStatus="avatar" />
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-16 relative">
        <Outlet />
      </main>

      <footer className="relative z-10 border-t border-line py-5">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-2 text-[10px] uppercase tracking-widest2 text-muted2"
             style={{ fontFamily: "JetBrains Mono, monospace" }}>
          <div>© 2026 Sirius — versioned state on chain</div>
          <div className="flex items-center gap-4">
            <span>0G</span>
            <span>·</span>
            <span>ENS</span>
            <span>·</span>
            <span>OpenClaw</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
