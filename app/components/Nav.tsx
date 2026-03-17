import { Link, Form } from "react-router";

interface NavProps {
  user: {
    username: string;
    role: string;
  };
}

export default function Nav({ user }: NavProps) {
  return (
    <header className="bg-white p-4 sm:p-5 rounded-2xl border-2 border-emerald-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-4">
        <Link to="/" className="flex items-center gap-3.5 group">
          <div className="relative">
            <div className="absolute -inset-1 bg-emerald-400/20 rounded-xl blur-sm group-hover:bg-emerald-400/30 transition-all"></div>
            <img 
              src="/bark-console-logo.png" 
              alt="Bark Logo" 
              className="relative w-11 h-11 rounded-xl object-contain bg-emerald-600 p-1.5 border-2 border-emerald-500 shadow-sm transition-transform group-hover:scale-105 duration-300"
            />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-extrabold text-emerald-950 tracking-tight leading-none">
              Bark Console
            </h1>
            <span className="text-[10px] uppercase tracking-[0.2em] font-black text-emerald-500/60 mt-1">
              Management Portal
            </span>
          </div>
        </Link>
      </div>

      <nav className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
        <Link to="/" className="px-4 py-2 hover:bg-emerald-50 text-emerald-800 rounded-xl text-sm font-bold transition-all border-2 border-transparent hover:border-emerald-100 active:scale-95">
          Dashboard
        </Link>
        <Link to="/security" className="px-4 py-2 hover:bg-emerald-50 text-emerald-800 rounded-xl text-sm font-bold transition-all border-2 border-transparent hover:border-emerald-100 active:scale-95">
          Security
        </Link>
        
        {user.role === "admin" && (
          <div className="h-4 w-px bg-emerald-100 mx-1 hidden sm:block"></div>
        )}

        {user.role === "admin" && (
          <>
            <Link to="/admin" className="px-4 py-2 hover:bg-emerald-50 text-emerald-600 rounded-xl text-sm font-bold transition-all border-2 border-transparent hover:border-emerald-100 active:scale-95">
              Users
            </Link>
            <Link to="/admin/settings" className="px-4 py-2 hover:bg-emerald-50 text-emerald-600 rounded-xl text-sm font-bold transition-all border-2 border-transparent hover:border-emerald-100 active:scale-95">
              Settings
            </Link>
          </>
        )}

        <div className="h-4 w-px bg-emerald-100 mx-1"></div>

        <Form action="/logout" method="post">
          <button className="ml-1 px-4 py-2 text-red-500 hover:bg-red-50 rounded-xl text-sm font-bold transition-all border-2 border-transparent hover:border-red-100 active:scale-95">
            Sign Out
          </button>
        </Form>
      </nav>
    </header>
  );
}
