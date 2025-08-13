import Header from '@/layouts/hydrogen/header';
import Sidebar from '@/layouts/hydrogen/sidebar';

export default function HydrogenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] pointer-events-none" style={{backgroundSize: '60px 60px'}} />
      
      {/* Main Layout */}
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <Sidebar className="fixed hidden xl:block z-30" />
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col xl:ml-[280px] 2xl:ml-[320px] transition-all duration-300">
          <Header />
          
          {/* Page Content */}
          <main className="flex-1 relative">
            {/* Content Background */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-white/80 dark:from-transparent dark:via-slate-900/50 dark:to-slate-900/80 pointer-events-none" />
            
            {/* Scrollable Content */}
            <div className="relative z-10 min-h-full px-6 py-8 lg:px-8 lg:py-12">
              <div className="max-w-7xl mx-auto">
                <div className="animate-fade-in-up duration-700">
                  {children}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
